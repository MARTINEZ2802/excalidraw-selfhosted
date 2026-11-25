import { Suspense, lazy, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, ChartGantt, Ellipsis, List, Pencil, Plus, SlidersHorizontal, SquareKanban, Trash } from "lucide-react";

import { useSession, userLabel } from "../auth/AuthGate";
import { useProject } from "../lib/projectStore";
import type { DbView, Page, ViewConfig, ViewType } from "../lib/supabase";
import { PageHeader } from "../pages/PageHeader";
import { Menu, useAnchor } from "../ui/Popover";
import { PromptModal } from "../ui/Modal";
import { Ico } from "../ui/icons";
import { GanttView } from "./GanttView";
import { KanbanView } from "./KanbanView";
import { ListView } from "./ListView";
import { PropertyManager } from "./PropertyManager";
import { useTaskDb } from "./useTaskDb";

const CalendarView = lazy(() => import("./CalendarView"));

export const VIEW_META: Record<ViewType, { icon: ReactNode; label: string }> = {
  list: { icon: <Ico icon={List} size={15} />, label: "Lista" },
  kanban: { icon: <Ico icon={SquareKanban} size={15} />, label: "Tablero" },
  gantt: { icon: <Ico icon={ChartGantt} size={15} />, label: "Cronograma" },
  calendar: { icon: <Ico icon={CalendarDays} size={15} />, label: "Calendario" },
};

const viewKey = (dbId: string) => `db:view:${dbId}`;

const TaskDatabase = ({ db }: { db: Page }) => {
  const store = useProject();
  const { canEdit, saveView, deleteView, members } = store;
  const { userById, me } = useSession();
  const views = store.views(db.id);
  const tdb = useTaskDb(db.id);
  const [viewId, setViewId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(viewKey(db.id));
    } catch {
      return null;
    }
  });
  const [showProps, setShowProps] = useState(false);
  const [renaming, setRenaming] = useState<DbView | null>(null);
  const addMenu = useAnchor();
  const viewMenu = useAnchor();
  const [menuView, setMenuView] = useState<DbView | null>(null);
  const [localCfg, setLocalCfg] = useState<Record<string, Partial<ViewConfig>>>({});

  const view = views.find((v) => v.id === viewId) ?? views[0];
  useEffect(() => {
    if (view)
      try {
        localStorage.setItem(viewKey(db.id), view.id);
      } catch {}
  }, [view, db.id]);

  if (!view) return <div className="page-wrap muted">Cargando vistas…</div>;
  // Los lectores no pueden guardar vistas: sus filtros quedan solo en esta sesión
  const cfg: ViewConfig = { ...view.config, ...(canEdit ? {} : localCfg[view.id]) };
  const setCfg = (patch: Partial<ViewConfig>) =>
    canEdit
      ? saveView({ id: view.id, db_id: db.id, config: { ...cfg, ...patch } })
      : setLocalCfg((m) => ({ ...m, [view.id]: { ...m[view.id], ...patch } }));
  const shown: DbView = { ...view, config: cfg };

  const total = tdb.tasks.length;
  const doneCount = tdb.tasks.filter(tdb.isDone).length;
  const groupables = tdb.properties.filter((p) => p.type === "status" || p.type === "select");

  return (
    <div className="page-wrap wide">
      <PageHeader page={db} />
      <div className="muted small">
        {total} tareas · {doneCount} hechas
      </div>

      <div className="tabs">
        {views.map((v) => (
          <button
            key={v.id}
            className={`tab${v.id === view.id ? " active" : ""}`}
            onClick={() => setViewId(v.id)}
            onContextMenu={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setMenuView(v);
              viewMenu.open(e);
            }}
          >
            {VIEW_META[v.type].icon} {v.name}
            {canEdit && v.id === view.id && (
              <span
                className="tab-more"
                onClick={(e) => {
                  setMenuView(v);
                  viewMenu.open(e);
                }}
              >
                <Ico icon={Ellipsis} size={14} />
              </span>
            )}
          </button>
        ))}
        {canEdit && (
          <button className="tab add" title="Agregar vista" onClick={addMenu.open}>
            <Ico icon={Plus} size={15} />
          </button>
        )}
      </div>

      <div className="toolbar">
        <label className="row gap-sm small">
          <input
            type="checkbox"
            checked={cfg.show_done !== false}
            onChange={(e) => setCfg({ show_done: e.target.checked })}
          />
          Mostrar hechas
        </label>
        <select
          className="sm"
          value={cfg.filter_assignee ?? ""}
          onChange={(e) => setCfg({ filter_assignee: e.target.value || null })}
        >
          <option value="">Todos los responsables</option>
          <option value={me.id}>Asignadas a mí</option>
          {members
            .filter((m) => m.user_id !== me.id)
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {userLabel(userById.get(m.user_id))}
              </option>
            ))}
        </select>
        {view.type === "list" && (
          <select className="sm" value={cfg.sort ?? "position"} onChange={(e) => setCfg({ sort: e.target.value as any })}>
            <option value="position">Orden manual</option>
            <option value="due_date">Por fecha de fin</option>
            <option value="start_date">Por fecha de inicio</option>
            <option value="title">Por nombre</option>
          </select>
        )}
        {view.type === "kanban" && (
          <select className="sm" value={cfg.group_by ?? "status"} onChange={(e) => setCfg({ group_by: e.target.value })}>
            {groupables.map((p) => (
              <option key={p.id} value={p.type === "status" ? "status" : p.id}>
                Agrupar por {p.name}
              </option>
            ))}
          </select>
        )}
        {view.type === "gantt" && (
          <div className="seg">
            {(["day", "week", "month"] as const).map((s) => (
              <button key={s} className={(cfg.scale ?? "week") === s ? "active" : ""} onClick={() => setCfg({ scale: s })}>
                {{ day: "Día", week: "Semana", month: "Mes" }[s]}
              </button>
            ))}
          </div>
        )}
        <span className="grow" />
        <button className="btn sm" onClick={() => setShowProps(true)}>
          <Ico icon={SlidersHorizontal} size={14} /> Propiedades
        </button>
      </div>

      {view.type === "list" && <ListView db={db} view={shown} tdb={tdb} />}
      {view.type === "kanban" && <KanbanView db={db} view={shown} tdb={tdb} />}
      {view.type === "gantt" && <GanttView db={db} view={shown} tdb={tdb} />}
      {view.type === "calendar" && (
        <Suspense fallback={<div className="muted pad">Cargando calendario…</div>}>
          <CalendarView db={db} view={shown} tdb={tdb} />
        </Suspense>
      )}

      {addMenu.anchor && (
        <Menu
          anchor={addMenu.anchor}
          onClose={addMenu.close}
          items={(Object.keys(VIEW_META) as ViewType[]).map((t) => ({
            label: VIEW_META[t].label,
            icon: VIEW_META[t].icon,
            onClick: async () => {
              const v = await saveView({
                db_id: db.id,
                name: VIEW_META[t].label,
                type: t,
                config: t === "kanban" ? { group_by: "status" } : t === "gantt" ? { scale: "week" } : {},
                position: Math.max(0, ...views.map((x) => x.position)) + 1,
              });
              if (v) setViewId(v.id);
            },
          }))}
        />
      )}
      {viewMenu.anchor && menuView && (
        <Menu
          anchor={viewMenu.anchor}
          onClose={viewMenu.close}
          items={[
            { label: "Renombrar vista", icon: <Ico icon={Pencil} />, onClick: () => setRenaming(menuView) },
            {
              label: "Eliminar vista",
              icon: <Ico icon={Trash} />,
              danger: true,
              disabled: views.length <= 1,
              onClick: () => window.confirm(`¿Eliminar la vista "${menuView.name}"?`) && deleteView(menuView.id),
            },
          ]}
        />
      )}
      {renaming && (
        <PromptModal
          title="Renombrar vista"
          initial={renaming.name}
          onSubmit={(name) => saveView({ id: renaming.id, db_id: db.id, name })}
          onClose={() => setRenaming(null)}
        />
      )}
      {showProps && <PropertyManager dbId={db.id} view={shown} onClose={() => setShowProps(false)} />}
    </div>
  );
};

export default TaskDatabase;
