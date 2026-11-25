import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useSession, userLabel } from "../auth/AuthGate";
import { useProjects } from "../layout/Shell";
import { Square, Trash, Users } from "lucide-react";

import { Ico, PageIcon, ProjectIcon } from "../ui/icons";
import { computeProgress, doneStatusIds } from "../lib/progress";
import { useProject } from "../lib/projectStore";
import { supabase } from "../lib/supabase";
import { MembersDialog } from "../members/MembersDialog";
import { ProgressBar } from "../tasks/cells";
import { EditableTitle } from "./PageHeader";
import { useToast } from "../ui/toast";

const today = () => new Date().toISOString().slice(0, 10);

export const ProjectHome = () => {
  const store = useProject();
  const { project, pages, children, members, canManage, updateProject } = store;
  const { userById, me } = useSession();
  const { reload } = useProjects();
  const toast = useToast();
  const nav = useNavigate();
  const [showMembers, setShowMembers] = useState(false);

  const dbs = useMemo(() => [...pages.values()].filter((p) => p.kind === "task_db"), [pages]);

  const stats = useMemo(
    () =>
      dbs.map((db) => {
        const tasks = [...pages.values()].filter((p) => p.db_id === db.id);
        const done = doneStatusIds(store.properties(db.id).find((p) => p.type === "status"));
        const prog = computeProgress(tasks, children, done);
        const top = tasks.filter((t) => t.parent_id === db.id);
        const overall = top.length
          ? Math.round(top.reduce((s, t) => s + (prog.get(t.id) ?? 0), 0) / top.length)
          : 0;
        const open = tasks.filter((t) => !(t.status && done.has(t.status)));
        const overdue = open.filter((t) => t.due_date && t.due_date < today());
        const mine = open.filter((t) => t.assignees.includes(me.id));
        return { db, total: tasks.length, done: tasks.length - open.length, overall, overdue, mine };
      }),
    [dbs, pages, children, store, me.id],
  );

  const recent = useMemo(
    () =>
      [...pages.values()]
        .filter((p) => p.kind !== "task")
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 8),
    [pages],
  );

  const deleteProject = async () => {
    if (!window.confirm(`¿Eliminar el proyecto "${project.name}" con TODAS sus páginas y pizarras?`))
      return;
    if (window.prompt(`Escribe el nombre del proyecto para confirmar`) !== project.name) return;
    for (const p of pages.values()) {
      if (!p.drawing_id) continue;
      const { data } = await supabase.storage.from("drawing-files").list(p.drawing_id);
      if (data?.length)
        await supabase.storage.from("drawing-files").remove(data.map((f) => `${p.drawing_id}/${f.name}`));
    }
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) return toast(error.message);
    await reload();
    nav("/");
  };

  return (
    <div className="page-wrap">
      <div className="title-row">
        <span className="title-icon">
          <ProjectIcon project={project} size={30} />
        </span>
        <EditableTitle
          value={project.name}
          disabled={!canManage}
          onSave={async (name) => {
            if (!name) return;
            await updateProject({ name });
            reload();
          }}
        />
      </div>
      <EditableTitle
        className="page-desc"
        value={project.description ?? ""}
        placeholder={canManage ? "Agrega una descripción…" : ""}
        disabled={!canManage}
        onSave={(description) => updateProject({ description })}
      />

      <div className="row wrap gap">
        <button className="chip-btn" onClick={() => setShowMembers(true)}>
          <Ico icon={Users} size={14} /> {members.length} participante{members.length === 1 ? "" : "s"}
        </button>
        <div className="avatars">
          {members.slice(0, 8).map((m) => (
            <span key={m.user_id} className="avatar" title={`${userLabel(userById.get(m.user_id))} · ${m.role}`}>
              {userLabel(userById.get(m.user_id)).slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        {canManage && (
          <button className="chip-btn danger" onClick={deleteProject}>
            <Ico icon={Trash} size={14} /> Eliminar proyecto
          </button>
        )}
      </div>

      <h2 className="section-title">Avance</h2>
      {stats.length === 0 && <p className="muted">Este proyecto no tiene bases de tareas.</p>}
      <div className="cards">
        {stats.map((s) => (
          <Link key={s.db.id} to={`/p/${project.id}/${s.db.id}`} className="card wide">
            <div className="card-title">
              <PageIcon page={s.db} /> {s.db.title}
            </div>
            <ProgressBar value={s.overall} />
            <div className="muted small">
              {s.done}/{s.total} tareas hechas
              {s.overdue.length > 0 && <span className="error"> · {s.overdue.length} vencidas</span>}
            </div>
          </Link>
        ))}
      </div>

      {stats.some((s) => s.mine.length || s.overdue.length) && (
        <>
          <h2 className="section-title">Pendientes</h2>
          <div className="list">
            {stats.flatMap((s) =>
              [...new Map([...s.overdue, ...s.mine].map((t) => [t.id, t])).values()].map((t) => (
                <Link key={t.id} to={`/p/${project.id}/${t.id}`} className="list-row">
                  <span className="row gap-sm">
                    <Ico icon={Square} className="muted" /> {t.title || "Sin título"}
                  </span>
                  <span className={`small ${t.due_date && t.due_date < today() ? "error" : "muted"}`}>
                    {t.assignees.includes(me.id) && "Asignada a ti · "}
                    {t.due_date ? `vence ${t.due_date}` : "sin fecha"}
                  </span>
                </Link>
              )),
            )}
          </div>
        </>
      )}

      <h2 className="section-title">Recientes</h2>
      <div className="list">
        {recent.map((p) => (
          <Link
            key={p.id}
            to={`/p/${project.id}/${p.id}`}
            className="list-row"
            onClick={(e) => {
              if (p.kind === "link" && p.url) {
                e.preventDefault();
                window.open(p.url, "_blank", "noopener,noreferrer");
              }
            }}
          >
            <span className="row gap-sm">
              <PageIcon page={p} /> {p.title || "Sin título"}
            </span>
            <span className="muted small">{new Date(p.updated_at).toLocaleString()}</span>
          </Link>
        ))}
      </div>
      {showMembers && <MembersDialog onClose={() => setShowMembers(false)} />}
    </div>
  );
};
