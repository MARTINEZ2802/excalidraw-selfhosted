import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ListChecks, Plus } from "lucide-react";

import { Ico } from "../ui/icons";

import { useProject } from "../lib/projectStore";
import type { DbView, Page, PropOption } from "../lib/supabase";
import { positionBetween } from "../lib/tree";
import { Avatar, Chip, ProgressBar } from "./cells";
import type { TaskDb } from "./useTaskDb";

const NONE = "__none__";

export const KanbanView = ({ db, view, tdb }: { db: Page; view: DbView; tdb: TaskDb }) => {
  const { project, pages, canEdit, createPage } = useProject();
  const nav = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const groupProp =
    tdb.properties.find((p) => p.id === view.config.group_by) ??
    (view.config.group_by === "status" ? tdb.statusProp : undefined) ??
    tdb.statusProp;
  if (!groupProp) return <div className="muted pad">Agrega una propiedad de tipo selección para agrupar.</div>;

  const columns: (PropOption | { id: string; name: string; color: string })[] = [
    ...(groupProp.type === "status" ? [] : [{ id: NONE, name: `Sin ${groupProp.name.toLowerCase()}`, color: "gray" }]),
    ...groupProp.options,
  ];
  const cards = tdb.applyFilters(tdb.tasks, view.config).sort((a, b) => a.position - b.position);
  const valueOf = (t: Page) => (tdb.getValue(t, groupProp) as string | null) ?? NONE;

  const moveTo = (colId: string) => {
    const t = dragId ? pages.get(dragId) : null;
    setDragId(null);
    setOver(null);
    if (!t || valueOf(t) === colId) return;
    tdb.setValue(t, groupProp, colId === NONE ? null : colId);
  };

  const add = async (colId: string) => {
    const name = title.trim();
    if (!name) return;
    const p = await createPage({
      kind: "task",
      parent_id: db.id,
      title: name,
      position: positionBetween(tdb.subtasks(db.id).at(-1)?.position),
      ...(groupProp.type === "status"
        ? { status: colId }
        : colId !== NONE
          ? { props: { [groupProp.id]: colId } }
          : {}),
    });
    if (p) setTitle("");
  };

  return (
    <div className="kanban">
      {columns.map((col) => {
        const list = cards.filter((t) => valueOf(t) === col.id);
        return (
          <div
            key={col.id}
            className={`kcol${over === col.id ? " over" : ""}`}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (over !== col.id) setOver(col.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              moveTo(col.id);
            }}
          >
            <div className="kcol-head">
              <Chip opt={col as PropOption} />
              <span className="muted small">{list.length}</span>
            </div>
            {list.map((t) => {
              const parent = t.parent_id && t.parent_id !== db.id ? pages.get(t.parent_id) : null;
              const subs = tdb.subtasks(t.id);
              const late = t.due_date && !tdb.isDone(t) && t.due_date < new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={t.id}
                  className={`kcard${dragId === t.id ? " dragging" : ""}`}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", t.id);
                    setDragId(t.id);
                  }}
                  onDragEnd={() => (setDragId(null), setOver(null))}
                  onClick={() => nav(`/p/${project.id}/${t.id}`)}
                >
                  {parent && <div className="muted small ellipsis">↳ {parent.title}</div>}
                  <div className="kcard-title">{t.title || "Sin título"}</div>
                  <div className="kcard-meta">
                    {t.due_date && (
                      <span className={`small row gap-xs ${late ? "error" : "muted"}`}>
                        <Ico icon={CalendarDays} size={13} /> {t.due_date}
                      </span>
                    )}
                    {subs.length > 0 && (
                      <span className="muted small row gap-xs">
                        <Ico icon={ListChecks} size={13} /> {subs.filter(tdb.isDone).length}/{subs.length}
                      </span>
                    )}
                    <span className="grow" />
                    <span className="avatars">
                      {t.assignees.map((a) => (
                        <Avatar key={a} id={a} />
                      ))}
                    </span>
                  </div>
                  {(subs.length > 0 || (tdb.progress.get(t.id) ?? 0) > 0) && (
                    <ProgressBar value={tdb.progress.get(t.id) ?? 0} compact />
                  )}
                </div>
              );
            })}
            {canEdit &&
              (adding === col.id ? (
                <input
                  className="inline-add"
                  autoFocus
                  placeholder="Nombre y Enter…"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setAdding(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add(col.id);
                    if (e.key === "Escape") setAdding(null);
                  }}
                />
              ) : (
                <button className="kadd" onClick={() => (setAdding(col.id), setTitle(""))}>
                  <Ico icon={Plus} size={14} /> Nueva
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
};
