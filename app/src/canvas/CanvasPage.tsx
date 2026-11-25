import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { useSession } from "../auth/AuthGate";
import { useProject } from "../lib/projectStore";
import { errMsg, supabase } from "../lib/supabase";
import type { Page } from "../lib/supabase";
import { Breadcrumb, EditableTitle } from "../pages/PageHeader";
import { PageIcon } from "../ui/icons";
import { collabEnabled, startCollab } from "./collab";
import type { CollabHandle } from "./collab";
import { loadScene, saveScene, sigOf } from "./scene";

const CanvasPage = ({ page }: { page: Page }) => {
  const { me } = useSession();
  const { updatePage, canEdit } = useProject();
  const drawingId = page.drawing_id!;
  const [initial, setInitial] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [api, setApi] = useState<any>(null);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [statusMsg, setStatusMsg] = useState("");
  const [peers, setPeers] = useState(0);

  const uploaded = useRef(new Set<string>());
  const lastSig = useRef("");
  const timer = useRef<number | undefined>(undefined);
  const apiRef = useRef<any>(null);
  const collab = useRef<CollabHandle | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);
  apiRef.current = api;

  // Cargar escena
  useEffect(() => {
    let alive = true;
    loadScene(drawingId, uploaded.current)
      .then(({ scene, files }) => {
        if (!alive) return;
        lastSig.current = sigOf(scene.elements || []);
        setInitial({
          elements: scene.elements || [],
          appState: { viewBackgroundColor: scene.appState?.viewBackgroundColor ?? "#ffffff" },
          files,
          scrollToContent: true,
        });
      })
      .catch((e) => alive && setLoadError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [drawingId]);

  const save = useCallback(async () => {
    const a = apiRef.current;
    if (!a || !canEdit) return;
    const els = a.getSceneElements();
    const sig = sigOf(els);
    if (sig === lastSig.current) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    const run = saveScene(
      drawingId,
      els,
      a.getAppState().viewBackgroundColor,
      a.getFiles(),
      uploaded.current,
      me.id,
    )
      .then(() => {
        lastSig.current = sig;
        // "toca" la página (updated_at) para refrescar miniaturas y recientes de todos
        supabase.from("pages").update({ drawing_id: drawingId }).eq("id", page.id).then(() => {});
        setStatus(sigOf(a.getSceneElements()) === sig ? "saved" : "dirty");
        setStatusMsg("");
      })
      .catch((e) => {
        setStatus("error");
        setStatusMsg(errMsg(e));
      });
    savingRef.current = run;
    await run;
  }, [drawingId, canEdit, me.id, page.id]);

  // Guardado final: al salir de la página, al ocultar la pestaña o al cerrarla
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timer.current);
      save();
    };
    const onVis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [save]);

  // Colaboración en vivo
  useEffect(() => {
    if (!api || !collabEnabled) return;
    let handle: CollabHandle | null = null;
    let cancelled = false;
    startCollab({
      api,
      drawingId,
      username: me.display_name || me.username,
      uploaded: uploaded.current,
      onPeers: setPeers,
    }).then((h) => {
      if (cancelled) h?.stop();
      else handle = collab.current = h;
    });
    return () => {
      cancelled = true;
      handle?.stop();
      collab.current = null;
    };
  }, [api, drawingId, me]);

  const onChange = (elements: readonly any[]) => {
    collab.current?.onLocalChange();
    if (!canEdit) return;
    if (sigOf(elements.filter((e) => !e.isDeleted)) !== lastSig.current) {
      setStatus((s) => (s === "saving" ? s : "dirty"));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(save, 2000);
    }
  };

  const label = {
    saved: "Guardado",
    dirty: "Sin guardar",
    saving: "Guardando…",
    error: statusMsg || "Error al guardar",
  }[status];

  return (
    <div className="canvas-page">
      <div className="canvas-bar">
        <Breadcrumb page={page} />
        <span className="sep">/</span>
        <span className="title-icon sm">
          <PageIcon page={page} size={15} />
        </span>
        <EditableTitle
          className="canvas-title"
          value={page.title}
          disabled={!canEdit}
          onSave={(title) => updatePage(page.id, { title })}
        />
        <span className="grow" />
        {peers > 0 && (
          <span className="pill live" title="Personas editando ahora">
            <span className="dot" /> {peers + 1} en vivo
          </span>
        )}
        {!canEdit && <span className="pill">Solo lectura</span>}
        {canEdit && (
          <>
            <span className={`small save-state save-${status}`}>
              <span className="dot" /> {label}
            </span>
            <button
              className="btn sm"
              disabled={status === "saved" || status === "saving"}
              onClick={() => {
                window.clearTimeout(timer.current);
                save();
              }}
            >
              Guardar
            </button>
          </>
        )}
      </div>
      <div className="canvas-host">
        {loadError ? (
          <div className="center error">No se pudo cargar la pizarra: {loadError}</div>
        ) : !initial ? (
          <div className="center muted">Cargando pizarra…</div>
        ) : (
          <Excalidraw
            initialData={initial}
            excalidrawAPI={setApi}
            onChange={onChange}
            onPointerUpdate={(p: any) => collab.current?.onPointer(p)}
            viewModeEnabled={!canEdit}
            isCollaborating={peers > 0}
            langCode="es-ES"
            UIOptions={{ canvasActions: { loadScene: false } }}
          />
        )}
      </div>
    </div>
  );
};

export default CanvasPage;
