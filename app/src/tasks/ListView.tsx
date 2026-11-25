import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Plus, Trash } from "lucide-react";

import { Ico } from "../ui/icons";

import { useProject } from "../lib/projectStore";
import type { DbView, Page } from "../lib/supabase";
import { positionBetween } from "../lib/tree";
import { DateCell, PersonCell, ProgressCell, PropCell } from "./cells";
import type { TaskDb } from "./useTaskDb";

type Zone = "before" | "inside" | "after";

const sorter = (sort: DbView["config"]["sort"]) => (a: Page, b: Page) => {
  if (sort === "due_date" || sort === "start_date") {
    const av = a[sort] ?? "9999";
    const bv = b[sort] ?? "9999";
    return av.localeCompare(bv) || a.position - b.position;
  }
  if (sort === "title") return a.title.localeCompare(b.title);
  return a.position - b.position;
};

export const ListView = ({ db, view, tdb }: { db: Page; view: DbView; tdb: TaskDb }) => {
  const { project, pages, canEdit, createPage, updatePage, deletePage } = useProject();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [subTitle, setSubTitle] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: Zone } | null>(null);

  const cfg = view.config;
  const visible = new Set(tdb.applyFilters(tdb.tasks, cfg).map((t) => t.id));
  const cols = tdb.customProps.filter((p) => !(cfg.hidden ?? []).includes(p.id));
  const sort = sorter(cfg.sort);

  const kids = (id: string) => tdb.subtasks(id).filter((t) => visible.has(t.id)).sort(sort);

  const addTask = async (parent: string, title: string) => {
    if (!title.trim()) return;
    await createPage({ kind: "task", parent_id: parent, title: title.trim() });
  };

  const onDrop = (target: Page, zone: Zone) => {
    const dragged = drag ? pages.get(drag) : null;
    setDrag(null);
    setDrop(null);
    if (!dragged || dragged.id === target.id) return;
    // evitar soltar dentro de su propio subárbol
    for (let c: Page | undefined = target; c; c = c.parent_id ? pages.get(c.parent_id) : undefined)
      if (c.id === dragged.id) return;
    if (zone === "inside") {
      const sibs = tdb.subtasks(target.id);
      setCollapsed((s) => (s.delete(target.id), new Set(s)));
      updatePage(dragged.id, { parent_id: target.id, position: positionBetween(sibs.at(-1)?.position) });
      return;
    }
    const sibs = tdb.subtasks(target.parent_id!).filter((s) => s.id !== dragged.id);
    const i = sibs.findIndex((s) => s.id === target.id);
    const [a, b] = zone === "before" ? [sibs[i - 1], sibs[i]] : [sibs[i], sibs[i + 1]];
    updatePage(dragged.id, {
      parent_id: target.parent_id,
      position: positionBetween(a?.position, b?.position),
    });
  };

  const renderRow = (t: Page, depth: number): React.ReactNode => {
    const subs = kids(t.id);
    const isCol = collapsed.has(t.id);
    const parent = tdb.isParent(t.id);
    const dz = drop?.id === t.id ? drop.zone : null;
    return (
      <Fragment key={t.id}>
        <tr
          className={`trow${dz ? ` drop-${dz}` : ""}${tdb.isDone(t) ? " done" : ""}`}
          draggable={canEdit && cfg.sort !== "due_date" && cfg.sort !== "start_date" && cfg.sort !== "title"}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", t.id);
            setDrag(t.id);
          }}
          onDragEnd={() => (setDrag(null), setDrop(null))}
          onDragOver={(e) => {
            if (!drag || drag === t.id) return;
            const r = e.currentTarget.getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            const zone: Zone = y < 0.3 ? "before" : y > 0.7 ? "after" : "inside";
            e.preventDefault();
            if (drop?.id !== t.id || drop.zone !== zone) setDrop({ id: t.id, zone });
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drop?.id === t.id) onDrop(t, drop.zone);
          }}
        >
          <td className="tcell title-cell">
            <div className="title-wrap" style={{ paddingLeft: depth * 20 }}>
              <button
                className={`caret${subs.length ? "" : " hidden"}${isCol ? "" : " open"}`}
                onClick={() =>
                  setCollapsed((s) => {
                    const n = new Set(s);
                    if (n.has(t.id)) n.delete(t.id);
                    else n.add(t.id);
                    return n;
                  })
                }
              >
                ▸
              </button>
              <input
                type="checkbox"
                className="done-check"
                checked={tdb.isDone(t)}
                disabled={!canEdit}
                title="Marcar como hecha"
                onChange={() => tdb.toggleDone(t)}
              />
              <span className="ellipsis grow task-title" onClick={() => nav(`/p/${project.id}/${t.id}`)}>
                {t.title || "Sin título"}
              </span>
              {subs.length > 0 && (
                <span className="muted small">
                  {subs.filter(tdb.isDone).length}/{subs.length}
                </span>
              )}
              <span className="row-actions">
                {canEdit && (
                  <button
                    className="icon-btn sm"
                    title="Agregar subtarea"
                    onClick={() => {
                      setAddingUnder(t.id);
                      setSubTitle("");
                      setCollapsed((s) => (s.delete(t.id), new Set(s)));
                    }}
                  >
                    <Ico icon={Plus} size={14} />
                  </button>
                )}
                <button className="icon-btn sm" title="Abrir" onClick={() => nav(`/p/${project.id}/${t.id}`)}>
                  <Ico icon={ArrowUpRight} size={14} />
                </button>
                {canEdit && (
                  <button
                    className="icon-btn sm"
                    title="Eliminar"
                    onClick={() => {
                      const n = tdb.subtasks(t.id).length;
                      if (window.confirm(`¿Eliminar "${t.title || "Sin título"}"${n ? ` y sus subtareas` : ""}?`))
                        deletePage(t.id);
                    }}
                  >
                    <Ico icon={Trash} size={14} />
                  </button>
                )}
              </span>
            </div>
          </td>
          {tdb.statusProp && (
            <td className="tcell">
              <PropCell
                prop={tdb.statusProp}
                value={t.status}
                disabled={!canEdit}
                onChange={(v) => tdb.setValue(t, tdb.statusProp!, v)}
              />
            </td>
          )}
          <td className="tcell">
            <PersonCell value={t.assignees} disabled={!canEdit} onChange={(v) => updatePage(t.id, { assignees: v })} />
          </td>
          <td className="tcell">
            <DateCell
              value={t.start_date}
              disabled={!canEdit}
              onChange={(v) =>
                updatePage(t.id, {
                  start_date: v,
                  ...(v && t.due_date && v > t.due_date ? { due_date: v } : {}),
                })
              }
            />
          </td>
          <td className="tcell">
            <DateCell
              value={t.due_date}
              disabled={!canEdit}
              onChange={(v) =>
                updatePage(t.id, {
                  due_date: v,
                  ...(v && t.start_date && v < t.start_date ? { start_date: v } : {}),
                })
              }
            />
          </td>
          <td className="tcell">
            <ProgressCell
              value={tdb.progress.get(t.id) ?? 0}
              computed={parent || tdb.isDone(t)}
              disabled={!canEdit}
              onChange={(v) => updatePage(t.id, { progress: v })}
            />
          </td>
          {cols.map((p) => (
            <td key={p.id} className="tcell">
              <PropCell
                prop={p}
                value={tdb.getValue(t, p)}
                disabled={!canEdit}
                onChange={(v) => tdb.setValue(t, p, v)}
              />
            </td>
          ))}
          <td />
        </tr>
        {!isCol && subs.map((s) => renderRow(s, depth + 1))}
        {addingUnder === t.id && (
          <tr>
            <td className="tcell" colSpan={7 + cols.length}>
              <input
                className="inline-add"
                style={{ marginLeft: (depth + 1) * 20 + 24 }}
                autoFocus
                placeholder="Nombre de la subtarea y Enter…"
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                onBlur={() => setAddingUnder(null)}
                onKeyDown={async (e) => {
                  if (e.key === "Escape") setAddingUnder(null);
                  if (e.key === "Enter") {
                    await addTask(t.id, subTitle);
                    setSubTitle("");
                  }
                }}
              />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const roots = kids(db.id);
  return (
    <div className="table-wrap">
      <table className="ttable">
        <thead>
          <tr>
            <th className="title-cell">Tarea</th>
            {tdb.statusProp && <th>{tdb.statusProp.name}</th>}
            <th>Responsables</th>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Avance</th>
            {cols.map((p) => (
              <th key={p.id}>{p.name}</th>
            ))}
            <th style={{ width: "100%" }} />
          </tr>
        </thead>
        <tbody>
          {roots.map((t) => renderRow(t, 0))}
          {canEdit && (
            <tr>
              <td className="tcell" colSpan={7 + cols.length}>
                <input
                  className="inline-add"
                  placeholder="+ Nueva tarea (escribe y Enter)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      await addTask(db.id, newTitle);
                      setNewTitle("");
                    }
                  }}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {roots.length === 0 && <div className="muted small pad">No hay tareas que mostrar.</div>}
    </div>
  );
};
