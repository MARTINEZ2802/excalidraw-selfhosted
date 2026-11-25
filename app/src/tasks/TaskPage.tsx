import { Suspense, lazy, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ArrowRight, ArrowUpRight, CalendarDays, Square, Trash } from "lucide-react";

import { KIND_LABEL, openLink } from "../lib/links";
import { Ico, KindIcon, PageIcon } from "../ui/icons";
import { useProject } from "../lib/projectStore";
import type { Page, PageKind } from "../lib/supabase";
import { PageHeader } from "../pages/PageHeader";
import { childKinds, useAddPage } from "../pages/useAddPage";
import { DateCell, PersonCell, ProgressBar, ProgressCell, PropCell } from "./cells";
import { useTaskDb } from "./useTaskDb";

const BlockEditor = lazy(() => import("../editor/BlockEditor"));

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="prop-row">
    <div className="prop-label">{label}</div>
    <div className="prop-value">{children}</div>
  </div>
);

const TaskPage = ({ page }: { page: Page }) => {
  const { project, pages, children, canEdit, updatePage, createPage, deletePage } = useProject();
  const tdb = useTaskDb(page.db_id!);
  const nav = useNavigate();
  const { add, modal } = useAddPage();
  const [subTitle, setSubTitle] = useState("");

  const subs = tdb.subtasks(page.id).sort((a, b) => a.position - b.position);
  const attachments = (children.get(page.id) ?? []).filter((c) => c.kind !== "task");
  const parentTask = page.parent_id ? pages.get(page.parent_id) : undefined;
  const db = pages.get(page.db_id!);
  const prog = tdb.progress.get(page.id) ?? 0;

  return (
    <div className="page-wrap">
      <PageHeader page={page} done={tdb.isDone(page)} />
      {parentTask?.kind === "task" && (
        <div className="muted small">
          Subtarea de{" "}
          <Link to={`/p/${project.id}/${parentTask.id}`} className="inline-link">
            <Ico icon={Square} size={13} /> {parentTask.title || "Sin título"}
          </Link>
        </div>
      )}

      <div className="props-panel">
        {tdb.statusProp && (
          <Row label="Estado">
            <PropCell
              prop={tdb.statusProp}
              value={page.status}
              disabled={!canEdit}
              onChange={(v) => tdb.setValue(page, tdb.statusProp!, v)}
            />
          </Row>
        )}
        <Row label="Responsables">
          <PersonCell value={page.assignees} disabled={!canEdit} onChange={(v) => updatePage(page.id, { assignees: v })} />
        </Row>
        <Row label="Inicio">
          <DateCell
            value={page.start_date}
            disabled={!canEdit}
            onChange={(v) =>
              updatePage(page.id, { start_date: v, ...(v && page.due_date && v > page.due_date ? { due_date: v } : {}) })
            }
          />
        </Row>
        <Row label="Fin">
          <DateCell
            value={page.due_date}
            disabled={!canEdit}
            onChange={(v) =>
              updatePage(page.id, { due_date: v, ...(v && page.start_date && v < page.start_date ? { start_date: v } : {}) })
            }
          />
        </Row>
        <Row label="Avance">
          <ProgressCell
            value={prog}
            computed={tdb.isParent(page.id) || tdb.isDone(page)}
            disabled={!canEdit}
            onChange={(v) => updatePage(page.id, { progress: v })}
          />
          {tdb.isParent(page.id) && <span className="muted small"> calculado de las subtareas</span>}
        </Row>
        {tdb.customProps.map((p) => (
          <Row key={p.id} label={p.name}>
            <PropCell prop={p} value={tdb.getValue(page, p)} disabled={!canEdit} onChange={(v) => tdb.setValue(page, p, v)} />
          </Row>
        ))}
        {db && (
          <Row label="Base">
            <Link to={`/p/${project.id}/${db.id}`} className="small inline-link">
              <PageIcon page={db} size={14} /> {db.title}
            </Link>
          </Row>
        )}
      </div>

      <section className="section">
        <div className="section-head">
          <h3>Subtareas</h3>
          {subs.length > 0 && <ProgressBar value={prog} compact />}
        </div>
        {subs.map((s) => (
          <div key={s.id} className={`sub-row${tdb.isDone(s) ? " done" : ""}`}>
            <input type="checkbox" checked={tdb.isDone(s)} disabled={!canEdit} onChange={() => tdb.toggleDone(s)} />
            <span className="grow ellipsis task-title" onClick={() => nav(`/p/${project.id}/${s.id}`)}>
              {s.title || "Sin título"}
            </span>
            {tdb.subtasks(s.id).length > 0 && (
              <span className="muted small">{tdb.subtasks(s.id).length} subtareas</span>
            )}
            {s.due_date && (
              <span className="muted small row gap-xs">
                <Ico icon={CalendarDays} size={13} /> {s.due_date}
              </span>
            )}
            <span className="sub-prog">
              <ProgressBar value={tdb.progress.get(s.id) ?? 0} compact />
            </span>
            {canEdit && (
              <button
                className="icon-btn sm"
                title="Eliminar subtarea"
                onClick={() => window.confirm(`¿Eliminar "${s.title}"?`) && deletePage(s.id)}
              >
                <Ico icon={Trash} size={14} />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <input
            className="inline-add"
            placeholder="+ Agregar subtarea (Enter)"
            value={subTitle}
            onChange={(e) => setSubTitle(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && subTitle.trim()) {
                await createPage({ kind: "task", parent_id: page.id, title: subTitle.trim() });
                setSubTitle("");
              }
            }}
          />
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Pizarras, notas y links</h3>
          {canEdit && (
            <div className="row gap-sm">
              {(childKinds(page).filter((k) => k !== "task") as PageKind[]).map((k) => (
                <button key={k} className="btn sm" onClick={() => add(k, page.id, { open: k !== "link" })}>
                  <KindIcon kind={k} size={14} /> {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
        </div>
        {attachments.length === 0 && <div className="muted small">Nada adjunto todavía.</div>}
        <div className="attach-grid">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="attach"
              onClick={() => (a.kind === "link" ? openLink(a.url) : nav(`/p/${project.id}/${a.id}`))}
            >
              <span className="attach-icon">
                <PageIcon page={a} />
              </span>
              <span className="ellipsis grow">{a.title || "Sin título"}</span>
              <Ico icon={a.kind === "link" ? ArrowUpRight : ArrowRight} size={14} className="muted" />
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Notas</h3>
          <span className="muted small">Escribe “/” para insertar bloques, pizarras o links</span>
        </div>
        <Suspense fallback={<div className="muted small pad">Cargando editor…</div>}>
          <BlockEditor key={page.id} page={page} childKinds={childKinds(page)} />
        </Suspense>
      </section>
      {modal}
    </div>
  );
};

export default TaskPage;
