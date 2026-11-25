import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { detectLinkKind, normalizeUrl } from "../lib/links";
import { useProject } from "../lib/projectStore";
import type { Page, PageKind } from "../lib/supabase";
import { Modal } from "../ui/Modal";

const DEFAULT_TITLE: Record<PageKind, string> = {
  task_db: "Tareas",
  task: "Nueva tarea",
  canvas: "Pizarra sin título",
  doc: "Sin título",
  link: "",
};

const LinkModal = ({
  onSubmit,
  onClose,
}: {
  onSubmit: (url: string, title: string) => void;
  onClose: () => void;
}) => {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const kind = detectLinkKind(url);
  const hint = {
    gsheet: "Hoja de cálculo de Google",
    gdoc: "Documento de Google",
    gslides: "Presentación de Google",
    other: "Enlace",
  }[kind];
  return (
    <Modal title="Agregar link" onClose={onClose} width={460}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const u = normalizeUrl(url);
          if (u) {
            onSubmit(u, title.trim() || hint.slice(3));
            onClose();
          }
        }}
      >
        <label>URL (Google Sheets, Docs, Slides o cualquier enlace)</label>
        <input
          autoFocus
          value={url}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          onChange={(e) => setUrl(e.target.value)}
        />
        {url && <div className="muted small">{hint} · se abrirá en una pestaña nueva</div>}
        <label>Nombre</label>
        <input value={title} placeholder="Ej. Presupuesto 2027" onChange={(e) => setTitle(e.target.value)} />
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!url.trim()}>
            Agregar
          </button>
        </div>
      </form>
    </Modal>
  );
};

/**
 * Crear páginas desde cualquier parte (árbol, tareas, editor).
 * Devuelve la función `add` y el modal que hay que renderizar.
 */
export const useAddPage = () => {
  const { createPage, project } = useProject();
  const nav = useNavigate();
  const [linkParent, setLinkParent] = useState<{
    parent: string | null;
    done?: (p: Page) => void;
  } | null>(null);

  const add = async (
    kind: PageKind,
    parent_id: string | null,
    opts: { open?: boolean; title?: string; onCreated?: (p: Page) => void } = {},
  ) => {
    if (kind === "link") {
      setLinkParent({ parent: parent_id, done: opts.onCreated });
      return null;
    }
    const p = await createPage({ kind, parent_id, title: opts.title ?? DEFAULT_TITLE[kind] });
    if (p) {
      opts.onCreated?.(p);
      if (opts.open ?? true) nav(`/p/${project.id}/${p.id}`);
    }
    return p;
  };

  const modal = linkParent && (
    <LinkModal
      onClose={() => setLinkParent(null)}
      onSubmit={async (url, title) => {
        const p = await createPage({
          kind: "link",
          parent_id: linkParent.parent,
          title,
          url,
          link_kind: detectLinkKind(url),
        });
        if (p) linkParent.done?.(p);
      }}
    />
  );

  return { add, modal };
};

/** Qué se puede crear dentro de cada tipo de página. */
export const childKinds = (parent: Page | null): PageKind[] => {
  if (!parent) return ["doc", "task_db", "canvas", "link"];
  switch (parent.kind) {
    case "task_db":
      return ["task"];
    case "task":
      return ["task", "canvas", "doc", "link"];
    case "doc":
      return ["doc", "task_db", "canvas", "link"];
    default:
      return [];
  }
};
