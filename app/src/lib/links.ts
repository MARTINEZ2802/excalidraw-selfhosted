import type { LinkKind, PageKind } from "./supabase";

export const detectLinkKind = (url: string): LinkKind => {
  const u = url.toLowerCase();
  if (u.includes("docs.google.com/spreadsheets")) return "gsheet";
  if (u.includes("docs.google.com/document")) return "gdoc";
  if (u.includes("docs.google.com/presentation")) return "gslides";
  return "other";
};

export const normalizeUrl = (raw: string) => {
  const t = raw.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

export const KIND_LABEL: Record<PageKind, string> = {
  task_db: "Base de tareas",
  task: "Tarea",
  canvas: "Pizarra",
  doc: "Nota",
  link: "Link",
};

export const openLink = (url: string | null) => {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
};
