// Carga/guardado de escenas Excalidraw en Supabase (portado de frontend/overlay/files/FilesLayer.tsx)
import { BUCKET, supabase } from "../lib/supabase";

export type StoredScene = {
  elements: any[];
  appState?: { viewBackgroundColor?: string };
  files?: Record<string, { id: string; mimeType: string; created: number }>;
};

export const sigOf = (els: readonly any[]) => els.map((e) => `${e.id}:${e.version}`).join(",");

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(b);
  });

/** Escena + archivos (imágenes) listos para `initialData`. */
export const loadScene = async (drawingId: string, uploaded?: Set<string>) => {
  const { data, error } = await supabase
    .from("drawings")
    .select("scene")
    .eq("id", drawingId)
    .single();
  if (error) throw error;
  const scene: StoredScene = (data?.scene as StoredScene) || { elements: [] };
  const files: Record<string, any> = {};
  await Promise.all(
    Object.entries(scene.files || {}).map(async ([fid, meta]) => {
      const { data: blob } = await supabase.storage.from(BUCKET).download(`${drawingId}/${fid}`);
      if (blob) {
        files[fid] = { ...meta, dataURL: await blobToDataUrl(blob) };
        uploaded?.add(`${drawingId}/${fid}`);
      }
    }),
  );
  return { scene, files };
};

/** Sube imágenes nuevas y guarda la escena. Lanza error si algo falla. */
export const saveScene = async (
  drawingId: string,
  elements: readonly any[],
  viewBackgroundColor: string | undefined,
  allFiles: Record<string, any>,
  uploaded: Set<string>,
  userId: string,
) => {
  const filesMeta: StoredScene["files"] = {};
  const used = new Set(
    elements.filter((e) => e.type === "image" && !e.isDeleted).map((e) => e.fileId as string),
  );
  for (const fid of used) {
    const f = allFiles[fid];
    if (!f) continue;
    filesMeta[fid] = { id: f.id, mimeType: f.mimeType, created: f.created };
    const key = `${drawingId}/${fid}`;
    if (!uploaded.has(key)) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(key, await dataUrlToBlob(f.dataURL), { upsert: true, contentType: f.mimeType });
      if (error) throw new Error("Error al subir imagen: " + error.message);
      uploaded.add(key);
    }
  }
  const { error } = await supabase
    .from("drawings")
    .update({
      scene: {
        elements: elements.filter((e) => !e.isDeleted),
        appState: { viewBackgroundColor },
        files: filesMeta,
      },
      updated_by: userId,
    })
    .eq("id", drawingId);
  if (error) throw new Error("Error al guardar: " + error.message);
};
