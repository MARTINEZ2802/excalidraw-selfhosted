import { createContext, useContext, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ArrowUpRight, ChevronRight, Ellipsis, House, Pencil, Plus, Shapes, Trash } from "lucide-react";

import { KIND_LABEL, openLink } from "../lib/links";
import { doneStatusIds } from "../lib/progress";
import { useProject } from "../lib/projectStore";
import type { Page, PageKind } from "../lib/supabase";
import { canNest, descendants, positionBetween } from "../lib/tree";
import { childKinds, useAddPage } from "../pages/useAddPage";
import { Menu, useAnchor } from "../ui/Popover";
import type { MenuItem } from "../ui/Popover";
import { PromptModal } from "../ui/Modal";
import { Ico, KindIcon, PageIcon } from "../ui/icons";

const EXPANDED_KEY = "tree:expanded";
const loadExpanded = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) || "[]"));
  } catch {
    return new Set();
  }
};

/** Primer carácter visible (un emoji compuesto cuenta como uno). */
export const firstGrapheme = (s: string) =>
  new Intl.Segmenter().segment(s.trim())[Symbol.iterator]().next().value?.segment ?? null;

type Zone = "before" | "inside" | "after";
type Drop = { id: string; zone: Zone } | null;

type TreeApi = {
  expanded: Set<string>;
  toggle: (id: string, force?: boolean) => void;
  done: Set<string>;
  activeId?: string;
  drop: Drop;
  setDrop: (d: Drop) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  validDrop: (dragged: Page, target: Page, zone: Zone) => boolean;
  doDrop: (target: Page, zone: Zone) => void;
  open: (p: Page) => void;
  addChild: (kind: PageKind, parent: Page | null) => void;
  rename: (p: Page) => void;
  changeIcon: (p: Page) => void;
  remove: (p: Page) => void;
};
const TreeCtx = createContext<TreeApi>(null!);

const TreeNode = ({ p, depth }: { p: Page; depth: number }) => {
  const t = useContext(TreeCtx);
  const { children, pages, canEdit } = useProject();
  const addMenu = useAnchor();
  const moreMenu = useAnchor();
  const kids = children.get(p.id) ?? [];
  const isOpen = t.expanded.has(p.id);
  const kinds = childKinds(p);
  const dz = t.drop?.id === p.id ? t.drop.zone : null;

  const moreItems: MenuItem[] = [
    ...(p.kind === "link"
      ? [{ label: "Abrir enlace", icon: <Ico icon={ArrowUpRight} />, onClick: () => openLink(p.url) }]
      : []),
    { label: "Renombrar", icon: <Ico icon={Pencil} />, onClick: () => t.rename(p), disabled: !canEdit },
    { label: "Cambiar ícono", icon: <Ico icon={Shapes} />, onClick: () => t.changeIcon(p), disabled: !canEdit },
    "sep",
    { label: "Eliminar", icon: <Ico icon={Trash} />, danger: true, onClick: () => t.remove(p), disabled: !canEdit },
  ];

  return (
    <>
      <div
        className={`tree-row${t.activeId === p.id ? " active" : ""}${dz ? ` drop-${dz}` : ""}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={canEdit}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", p.id);
          t.setDragId(p.id);
        }}
        onDragEnd={() => {
          t.setDragId(null);
          t.setDrop(null);
        }}
        onDragOver={(e) => {
          const dragged = t.dragId ? pages.get(t.dragId) : null;
          if (!dragged) return;
          const r = e.currentTarget.getBoundingClientRect();
          const y = (e.clientY - r.top) / r.height;
          const zone: Zone = y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
          if (!t.validDrop(dragged, p, zone)) return;
          e.preventDefault();
          if (t.drop?.id !== p.id || t.drop.zone !== zone) t.setDrop({ id: p.id, zone });
        }}
        onDragLeave={() => t.drop?.id === p.id && t.setDrop(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (t.drop?.id === p.id) t.doDrop(p, t.drop.zone);
        }}
        onClick={() => t.open(p)}
      >
        <button
          className={`caret${kids.length ? "" : " hidden"}${isOpen ? " open" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            t.toggle(p.id);
          }}
          aria-label={isOpen ? "Contraer" : "Expandir"}
        >
          <Ico icon={ChevronRight} size={14} />
        </button>
        <span className="tree-icon">
          <PageIcon page={p} done={!!p.status && t.done.has(p.status)} />
        </span>
        <span className="ellipsis grow">{p.title || "Sin título"}</span>
        {p.kind === "link" && <Ico icon={ArrowUpRight} size={13} className="muted" />}
        <span className="row-actions">
          <button className="icon-btn sm" title="Más" onClick={moreMenu.open}>
            <Ico icon={Ellipsis} size={14} />
          </button>
          {canEdit && kinds.length > 0 && (
            <button className="icon-btn sm" title="Agregar dentro" onClick={addMenu.open}>
              <Ico icon={Plus} size={14} />
            </button>
          )}
        </span>
      </div>
      {addMenu.anchor && (
        <Menu
          anchor={addMenu.anchor}
          onClose={addMenu.close}
          items={kinds.map((k) => ({
            label: p.kind === "task" && k === "task" ? "Subtarea" : KIND_LABEL[k],
            icon: <KindIcon kind={k} />,
            onClick: () => t.addChild(k, p),
          }))}
        />
      )}
      {moreMenu.anchor && <Menu anchor={moreMenu.anchor} onClose={moreMenu.close} items={moreItems} />}
      {isOpen && kids.map((k) => <TreeNode key={k.id} p={k} depth={depth + 1} />)}
    </>
  );
};

export const PageTree = () => {
  const store = useProject();
  const { project, children, pages, canEdit, updatePage, deletePage } = store;
  const { pageId } = useParams();
  const nav = useNavigate();
  const { add, modal } = useAddPage();
  const [expanded, setExpanded] = useState(loadExpanded);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [renaming, setRenaming] = useState<Page | null>(null);
  const [iconFor, setIconFor] = useState<Page | null>(null);
  const rootMenu = useAnchor();

  // Estados "hecho" de todas las bases, para el ícono ☑ de las tareas
  const done = useMemo(() => {
    const s = new Set<string>();
    for (const p of pages.values())
      if (p.kind === "task_db")
        for (const id of doneStatusIds(store.properties(p.id).find((x) => x.type === "status")))
          s.add(id);
    return s;
  }, [pages, store]);

  const toggle = (id: string, force?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (force ?? !next.has(id)) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  const validDrop = (dragged: Page, target: Page, zone: Zone) => {
    if (dragged.id === target.id) return false;
    if (descendants(children, dragged.id).some((d) => d.id === target.id)) return false;
    const newParent =
      zone === "inside" ? target : target.parent_id ? (pages.get(target.parent_id) ?? null) : null;
    if (!canNest(dragged.kind, newParent)) return false;
    if (dragged.kind === "task") {
      // Una tarea no puede cambiar de base de tareas
      const dbOf = newParent?.kind === "task_db" ? newParent.id : newParent?.db_id;
      if (dbOf !== dragged.db_id) return false;
    }
    return true;
  };

  const doDrop = (target: Page, zone: Zone) => {
    const dragged = dragId ? pages.get(dragId) : null;
    setDragId(null);
    setDrop(null);
    if (!dragged || !validDrop(dragged, target, zone)) return;
    if (zone === "inside") {
      const sibs = children.get(target.id) ?? [];
      toggle(target.id, true);
      updatePage(dragged.id, {
        parent_id: target.id,
        position: positionBetween(sibs.at(-1)?.position, undefined),
      });
      return;
    }
    const sibs = (children.get(target.parent_id) ?? []).filter((s) => s.id !== dragged.id);
    const i = sibs.findIndex((s) => s.id === target.id);
    const [a, b] = zone === "before" ? [sibs[i - 1], sibs[i]] : [sibs[i], sibs[i + 1]];
    updatePage(dragged.id, {
      parent_id: target.parent_id,
      position: positionBetween(a?.position, b?.position),
    });
  };

  const api: TreeApi = {
    expanded,
    toggle,
    done,
    activeId: pageId,
    drop,
    setDrop,
    dragId,
    setDragId,
    validDrop,
    doDrop,
    open: (p) => (p.kind === "link" ? openLink(p.url) : nav(`/p/${project.id}/${p.id}`)),
    addChild: (kind, parent) => {
      if (parent) toggle(parent.id, true);
      add(kind, parent?.id ?? null);
    },
    rename: setRenaming,
    changeIcon: setIconFor,
    remove: async (p) => {
      const sub = descendants(children, p.id);
      const name = p.title || "Sin título";
      if (!window.confirm(sub.length ? `¿Eliminar "${name}" y sus ${sub.length} páginas internas?` : `¿Eliminar "${name}"?`))
        return;
      const inside = pageId === p.id || sub.some((d) => d.id === pageId);
      await deletePage(p.id);
      if (inside) nav(`/p/${project.id}`);
    },
  };

  const roots = children.get(null) ?? [];
  return (
    <TreeCtx.Provider value={api}>
      <div className="tree">
        <div className="side-label">
          <span className="ellipsis">Páginas</span>
          {canEdit && (
            <button className="icon-btn sm" title="Nueva página" onClick={rootMenu.open}>
              <Ico icon={Plus} size={14} />
            </button>
          )}
        </div>
        <div
          className={`tree-row${!pageId ? " active" : ""}`}
          style={{ paddingLeft: 6 }}
          onClick={() => nav(`/p/${project.id}`)}
        >
          <span className="caret hidden" />
          <span className="tree-icon">
            <Ico icon={House} />
          </span>
          <span className="grow">Inicio</span>
        </div>
        {roots.map((p) => (
          <TreeNode key={p.id} p={p} depth={0} />
        ))}
        {rootMenu.anchor && (
          <Menu
            anchor={rootMenu.anchor}
            onClose={rootMenu.close}
            items={childKinds(null).map((k) => ({
              label: KIND_LABEL[k],
              icon: <KindIcon kind={k} />,
              onClick: () => api.addChild(k, null),
            }))}
          />
        )}
        {modal}
        {renaming && (
          <PromptModal
            title="Renombrar"
            initial={renaming.title}
            onSubmit={(title) => updatePage(renaming.id, { title })}
            onClose={() => setRenaming(null)}
          />
        )}
        {iconFor && (
          <PromptModal
            title="Ícono"
            label="Pega un emoji, o déjalo vacío para usar el ícono por defecto"
            initial={iconFor.icon ?? ""}
            allowEmpty
            onSubmit={(icon) => updatePage(iconFor.id, { icon: icon ? firstGrapheme(icon) : null })}
            onClose={() => setIconFor(null)}
          />
        )}
      </div>
    </TreeCtx.Provider>
  );
};
