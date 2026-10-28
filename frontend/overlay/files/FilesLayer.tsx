import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";

import { AdminPanel } from "./AdminPanel";
import { supabase } from "./supabase";
import type { Drawing, Folder, Profile } from "./supabase";

const BUCKET = "drawing-files";
const DRAWING_COLUMNS = "id,folder_id,name,room_id,updated_at";
const inRoom = () => window.location.hash.startsWith("#room=");

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(b);
  });
const sigOf = (els: readonly any[]) =>
  els.map((e) => `${e.id}:${e.version}`).join(",");

export const FilesLayer = () => {
  const api = useExcalidrawAPI();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"files" | "admin">("files");
  const [me, setMe] = useState<Profile | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentRef = useRef<string | null>(null);
  const lastSig = useRef("");
  const timer = useRef<number | undefined>(undefined);
  const uploaded = useRef(new Set<string>());
  currentRef.current = currentId;

  const refresh = useCallback(async () => {
    const [f, d] = await Promise.all([
      supabase.from("folders").select("id,name").order("name"),
      supabase.from("drawings").select(DRAWING_COLUMNS).order("name"),
    ]);
    setFolders((f.data as Folder[]) || []);
    setDrawings((d.data as Drawing[]) || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user!.id)
        .single();
      setMe(data as Profile);
      refresh();
    })();
  }, [refresh]);

  const save = useCallback(async () => {
    const id = currentRef.current;
    if (!api || !id) {
      return;
    }
    const els = api.getSceneElements();
    const sig = sigOf(els);
    if (sig === lastSig.current) {
      setDirty(false);
      return;
    }
    // Una sala recién unida sin pares aparece vacía: no pisar lo guardado.
    if (els.length === 0 && inRoom()) {
      return;
    }
    const files = api.getFiles();
    const filesMeta: Record<string, unknown> = {};
    const usedIds = new Set(
      els.filter((e: any) => e.type === "image").map((e: any) => e.fileId),
    );
    for (const fid of usedIds) {
      const f = files[fid as string];
      if (!f) {
        continue;
      }
      filesMeta[fid as string] = {
        id: f.id,
        mimeType: f.mimeType,
        created: f.created,
      };
      if (!uploaded.current.has(`${id}/${fid}`)) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(`${id}/${fid}`, await dataUrlToBlob(f.dataURL), {
            upsert: true,
            contentType: f.mimeType,
          });
        if (!error) {
          uploaded.current.add(`${id}/${fid}`);
        }
      }
    }
    const { error } = await supabase
      .from("drawings")
      .update({
        scene: {
          elements: els,
          appState: {
            viewBackgroundColor: api.getAppState().viewBackgroundColor,
          },
          files: filesMeta,
        },
        updated_by: me?.id,
      })
      .eq("id", id);
    if (error) {
      setStatus("Error al guardar");
    } else {
      lastSig.current = sig;
      setDirty(false);
      setStatus("Guardado " + new Date().toLocaleTimeString());
    }
  }, [api, me]);

  const saveNow = async () => {
    window.clearTimeout(timer.current);
    setSaving(true);
    await save();
    setSaving(false);
  };

  // Autoguardado (debounce) + guardado final al cerrar la sala o la pestaña
  useEffect(() => {
    if (!api) {
      return;
    }
    const unsub = api.onChange(() => {
      if (currentRef.current) {
        setDirty(sigOf(api.getSceneElements()) !== lastSig.current);
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(save, 2000);
    });
    const flush = () => {
      window.clearTimeout(timer.current);
      save();
    };
    const onHash = async () => {
      const id = currentRef.current;
      if (!id) {
        return;
      }
      if (inRoom()) {
        await supabase
          .from("drawings")
          .update({ room_id: window.location.hash })
          .eq("id", id);
      } else {
        await save();
        await supabase.from("drawings").update({ room_id: null }).eq("id", id);
      }
      refresh();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      unsub();
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [api, save, refresh]);

  const openDrawing = async (d: Drawing) => {
    if (!api) {
      return;
    }
    await save();
    const { data } = await supabase
      .from("drawings")
      .select("scene")
      .eq("id", d.id)
      .single();
    const scene: any = data?.scene || {};
    const files: any[] = [];
    for (const [fid, meta] of Object.entries<any>(scene.files || {})) {
      const { data: blob } = await supabase.storage
        .from(BUCKET)
        .download(`${d.id}/${fid}`);
      if (blob) {
        files.push({ ...meta, dataURL: await blobToDataUrl(blob) });
        uploaded.current.add(`${d.id}/${fid}`);
      }
    }
    api.resetScene();
    if (files.length) {
      api.addFiles(files);
    }
    api.updateScene({
      elements: scene.elements || [],
      appState: scene.appState || {},
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    lastSig.current = sigOf(scene.elements || []);
    setDirty(false);
    setCurrentId(d.id);
    setStatus("");
  };

  const createDrawing = async (folder: Folder) => {
    const name = prompt(`Nombre del dibujo en "${folder.name}"`)?.trim();
    if (!name || !api || !me) {
      return;
    }
    await save();
    const { data, error } = await supabase
      .from("drawings")
      .insert({ folder_id: folder.id, name, updated_by: me.id })
      .select(DRAWING_COLUMNS)
      .single();
    if (error || !data) {
      setStatus("Error: " + error?.message);
      return;
    }
    api.resetScene();
    lastSig.current = "";
    setDirty(false);
    setCurrentId(data.id);
    await refresh();
  };

  const act = async (fn: () => PromiseLike<{ error: any }>) => {
    const { error } = await fn();
    if (error) {
      setStatus("Error: " + error.message);
    }
    refresh();
  };

  const current = drawings.find((d) => d.id === currentId);
  const currentFolder = folders.find((f) => f.id === current?.folder_id);

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: "50%",
          bottom: 12,
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 12px",
          borderRadius: 8,
          background: "#fff",
          color: "#222",
          border: "1px solid #ccc",
          fontSize: 14,
          boxShadow: "0 2px 10px rgba(0,0,0,.15)",
        }}
      >
        {current ? (
          <>
            <span>
              📄 <b>{current.name}</b>
              {currentFolder && (
                <span style={{ opacity: 0.6 }}> · 📁 {currentFolder.name}</span>
              )}
              {current.room_id && " · 🔴 sala"}
            </span>
            <span style={{ fontSize: 12, color: dirty ? "#e67700" : "#2b8a3e" }}>
              {dirty ? "● Cambios sin guardar" : status || "✓ Guardado"}
            </span>
            <button onClick={saveNow} disabled={saving || !dirty}>
              {saving ? "Guardando…" : "💾 Guardar"}
            </button>
          </>
        ) : (
          <span style={{ color: "#c92a2a" }}>
            Sin dibujo seleccionado: los cambios no se guardan. Abre o crea uno
            en 📁 Archivos.
          </span>
        )}
      </div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          right: 64,
          bottom: 12,
          zIndex: 100,
          padding: "8px 12px",
          borderRadius: 8,
        }}
      >
        📁 Archivos
      </button>
      {open && me && (
        <div
          style={{
            position: "fixed",
            right: 12,
            bottom: 56,
            width: 360,
            maxHeight: "70vh",
            overflow: "auto",
            background: "#fff",
            color: "#222",
            border: "1px solid #ccc",
            borderRadius: 10,
            padding: 12,
            zIndex: 100,
            fontSize: 14,
            boxShadow: "0 4px 24px rgba(0,0,0,.2)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              👤 {me.username} ({me.role})
            </span>
            <button onClick={() => supabase.auth.signOut()}>Salir</button>
          </div>
          {me.role === "admin" && (
            <div style={{ margin: "8px 0" }}>
              <button onClick={() => setTab("files")}>Dibujos</button>{" "}
              <button onClick={() => setTab("admin")}>Administración</button>
            </div>
          )}
          <div style={{ fontSize: 12, opacity: 0.7 }}>{status}</div>
          {tab === "admin" && me.role === "admin" ? (
            <AdminPanel folders={folders} me={me} onFoldersChanged={refresh} />
          ) : (
            <>
              {folders.length === 0 && (
                <p>
                  No tienes carpetas asignadas. Pide acceso a un administrador.
                </p>
              )}
              {folders.map((f) => (
                <div key={f.id} style={{ marginTop: 8 }}>
                  <b>📁 {f.name}</b>{" "}
                  <button onClick={() => createDrawing(f)}>+ dibujo</button>
                  {drawings
                    .filter((d) => d.folder_id === f.id)
                    .map((d) => (
                      <div
                        key={d.id}
                        style={{
                          marginLeft: 16,
                          padding: "2px 0",
                          background: d.id === currentId ? "#e7f5ff" : "none",
                        }}
                      >
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openDrawing(d);
                          }}
                        >
                          {d.name}
                        </a>{" "}
                        {d.room_id && d.id !== currentId && (
                          <button
                            title="Unirse a la sala activa"
                            onClick={() => {
                              window.location.hash = d.room_id!;
                              window.location.reload();
                            }}
                          >
                            🔴 sala
                          </button>
                        )}
                        <select
                          value={d.folder_id}
                          title="Mover a…"
                          onChange={(e) =>
                            act(() =>
                              supabase
                                .from("drawings")
                                .update({ folder_id: e.target.value })
                                .eq("id", d.id),
                            )
                          }
                        >
                          {folders.map((o) => (
                            <option key={o.id} value={o.id}>
                              → {o.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const name = prompt("Nuevo nombre", d.name)?.trim();
                            if (name) {
                              act(() =>
                                supabase
                                  .from("drawings")
                                  .update({ name })
                                  .eq("id", d.id),
                              );
                            }
                          }}
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar "${d.name}"?`)) {
                              if (d.id === currentId) {
                                setCurrentId(null);
                              }
                              act(() =>
                                supabase
                                  .from("drawings")
                                  .delete()
                                  .eq("id", d.id),
                              );
                            }
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
};
