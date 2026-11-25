// Colaboración en vivo sobre el servidor excalidraw-room (mismo protocolo que excalidraw.com):
//   cliente -> "join-room", "server-broadcast" / "server-volatile-broadcast" (datos cifrados + iv)
//   servidor -> "init-room", "new-user", "room-user-change", "client-broadcast"
// La clave AES-GCM vive en drawings.room_id ("v2:<sala>,<clave>"), protegida por RLS:
// solo quien puede leer el dibujo puede descifrar la sala.
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { CaptureUpdateAction, reconcileElements } from "@excalidraw/excalidraw";

import { BUCKET, supabase } from "../lib/supabase";

const WS_URL = import.meta.env.VITE_APP_WS_SERVER_URL as string | undefined;
export const collabEnabled = !!WS_URL;

const b64u = {
  enc: (buf: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  dec: (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};
const randHex = (n: number) =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Obtiene (o crea una sola vez, sin carreras) la sala y clave del dibujo. */
const getRoom = async (drawingId: string) => {
  const read = async () =>
    (await supabase.from("drawings").select("room_id").eq("id", drawingId).single()).data
      ?.room_id as string | null;
  let r = await read();
  if (!r?.startsWith("v2:")) {
    const raw = crypto.getRandomValues(new Uint8Array(16));
    const candidate = `v2:${randHex(10)},${b64u.enc(raw.buffer)}`;
    await supabase
      .from("drawings")
      .update({ room_id: candidate })
      .eq("id", drawingId)
      .or("room_id.is.null,room_id.not.like.v2:*");
    r = await read();
  }
  if (!r?.startsWith("v2:")) return null;
  const [roomId, keyStr] = r.slice(3).split(",");
  const key = await crypto.subtle.importKey("raw", b64u.dec(keyStr), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return { roomId, key };
};

type Msg =
  | { type: "SCENE_INIT" | "SCENE_UPDATE"; payload: { elements: any[] } }
  | {
      type: "MOUSE_LOCATION";
      payload: {
        socketId: string;
        pointer: { x: number; y: number; tool: "pointer" | "laser" };
        button: "up" | "down";
        selectedElementIds: Record<string, true>;
        username: string;
      };
    };

const COLORS = ["#e03131", "#1971c2", "#2f9e44", "#f08c00", "#9c36b5", "#0c8599", "#e8590c"];
const colorFor = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const c = COLORS[Math.abs(h) % COLORS.length];
  return { background: c, stroke: c };
};

export type CollabHandle = {
  /** Llamar en cada onChange del editor. */
  onLocalChange: () => void;
  onPointer: (p: { pointer: { x: number; y: number; tool: "pointer" | "laser" }; button: "up" | "down" }) => void;
  stop: () => void;
};

export const startCollab = async (opts: {
  api: any; // ExcalidrawImperativeAPI
  drawingId: string;
  username: string;
  uploaded: Set<string>;
  onPeers: (n: number) => void;
}): Promise<CollabHandle | null> => {
  if (!WS_URL) return null;
  const room = await getRoom(opts.drawingId);
  if (!room) return null;
  const { api } = opts;
  const socket: Socket = io(WS_URL, { transports: ["websocket", "polling"] });
  const sent = new Map<string, number>(); // id -> versión ya difundida o recibida
  const collaborators = new Map<string, any>();
  let stopped = false;
  // Lo cargado de la BD ya lo tienen todos: no re-difundirlo
  for (const e of api.getSceneElementsIncludingDeleted()) sent.set(e.id, e.version);

  const encrypt = async (m: Msg) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      room.key,
      new TextEncoder().encode(JSON.stringify(m)),
    );
    return { data, iv };
  };
  const send = async (m: Msg, volatile = false) => {
    if (!socket.connected) return;
    const { data, iv } = await encrypt(m);
    socket.emit(volatile ? "server-volatile-broadcast" : "server-broadcast", room.roomId, data, iv);
  };

  const broadcastAll = (type: "SCENE_INIT" | "SCENE_UPDATE") => {
    const els = api.getSceneElementsIncludingDeleted();
    for (const e of els) sent.set(e.id, e.version);
    send({ type, payload: { elements: els } });
  };

  // Imágenes de otros: se descargan del storage (el autor las sube al guardar)
  const fetchMissingFiles = async (elements: any[], attempt = 0) => {
    const have = api.getFiles();
    const missing = [
      ...new Set(
        elements
          .filter((e) => e.type === "image" && e.fileId && !e.isDeleted && !have[e.fileId])
          .map((e) => e.fileId as string),
      ),
    ];
    if (!missing.length || stopped) return;
    const still: string[] = [];
    const add: any[] = [];
    for (const fid of missing) {
      const { data: blob } = await supabase.storage.from(BUCKET).download(`${opts.drawingId}/${fid}`);
      if (!blob) {
        still.push(fid);
        continue;
      }
      const dataURL = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(blob);
      });
      opts.uploaded.add(`${opts.drawingId}/${fid}`);
      add.push({ id: fid, dataURL, mimeType: blob.type || "image/png", created: Date.now() });
    }
    if (add.length) api.addFiles(add);
    if (still.length && attempt < 6) {
      window.setTimeout(() => fetchMissingFiles(elements, attempt + 1), 2500);
    }
  };

  socket.on("init-room", () => socket.emit("join-room", room.roomId));
  socket.on("new-user", () => broadcastAll("SCENE_INIT"));
  socket.on("room-user-change", (clients: string[]) => {
    for (const id of [...collaborators.keys()]) if (!clients.includes(id)) collaborators.delete(id);
    opts.onPeers(Math.max(0, clients.length - 1));
    api.updateScene({ collaborators: new Map(collaborators) });
  });
  socket.on("client-broadcast", async (data: ArrayBuffer, iv: Uint8Array) => {
    let m: Msg;
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, room.key, data);
      m = JSON.parse(new TextDecoder().decode(plain));
    } catch {
      return; // otra clave o mensaje corrupto
    }
    if (m.type === "SCENE_INIT" || m.type === "SCENE_UPDATE") {
      const reconciled = reconcileElements(
        api.getSceneElementsIncludingDeleted(),
        m.payload.elements as any,
        api.getAppState(),
      );
      for (const e of m.payload.elements) {
        sent.set(e.id, Math.max(sent.get(e.id) ?? 0, e.version));
      }
      api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
      fetchMissingFiles(m.payload.elements);
    } else if (m.type === "MOUSE_LOCATION") {
      const p = m.payload;
      collaborators.set(p.socketId, {
        pointer: p.pointer,
        button: p.button,
        selectedElementIds: p.selectedElementIds,
        username: p.username,
        color: colorFor(p.socketId),
        socketId: p.socketId,
      });
      api.updateScene({ collaborators: new Map(collaborators) });
    }
  });

  let t: number | undefined;
  let lastPointer = 0;
  return {
    onLocalChange: () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const all = api.getSceneElementsIncludingDeleted();
        const changed = all.filter((e: any) => (sent.get(e.id) ?? -1) < e.version);
        if (!changed.length) return;
        for (const e of changed) sent.set(e.id, e.version);
        send({ type: "SCENE_UPDATE", payload: { elements: changed } });
      }, 60);
    },
    onPointer: ({ pointer, button }) => {
      const now = Date.now();
      if (now - lastPointer < 50 || !socket.id) return;
      lastPointer = now;
      send(
        {
          type: "MOUSE_LOCATION",
          payload: {
            socketId: socket.id,
            pointer,
            button,
            selectedElementIds: api.getAppState().selectedElementIds,
            username: opts.username,
          },
        },
        true,
      );
    },
    stop: () => {
      stopped = true;
      window.clearTimeout(t);
      socket.disconnect();
    },
  };
};
