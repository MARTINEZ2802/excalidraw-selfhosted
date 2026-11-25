import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { LogOut, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";

import { useSession } from "../auth/AuthGate";
import { errMsg, supabase } from "../lib/supabase";
import type { Project } from "../lib/supabase";
import { PromptModal } from "../ui/Modal";
import { Ico, ProjectIcon } from "../ui/icons";
import { useToast } from "../ui/toast";

type ProjectsApi = { projects: Project[]; reload: () => Promise<void>; create: () => void };
const ProjectsCtx = createContext<ProjectsApi>({
  projects: [],
  reload: async () => {},
  create: () => {},
});
/** Lista de proyectos (la mantiene el Shell). */
export const useProjects = () => useContext(ProjectsCtx);

export const Shell = ({ sidebar, children }: { sidebar?: ReactNode; children: ReactNode }) => {
  const { me } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const { projectId } = useParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar:collapsed") === "1";
    } catch {
      return false;
    }
  });

  const reload = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").order("name");
    setProjects((data as Project[]) ?? []);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const createProject = async (name: string) => {
    const { data, error } = await supabase
      .from("projects")
      .insert({ name, created_by: me.id })
      .select("*")
      .single();
    if (error || !data) {
      toast("No se pudo crear el proyecto: " + errMsg(error));
      return;
    }
    // Todo proyecto nace con una base de tareas
    await supabase
      .from("pages")
      .insert({ project_id: data.id, kind: "task_db", title: "Tareas", position: 0 });
    await reload();
    nav(`/p/${data.id}`);
  };

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar:collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  return (
    <div className={`shell${collapsed ? " collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="side-head">
          <Link to="/" className="brand">
            Proyectos
          </Link>
          <button className="icon-btn" title="Ocultar barra" onClick={toggle}>
            <Ico icon={PanelLeftClose} />
          </button>
        </div>
        <div className="side-section">
          <div className="side-label">
            Espacios
            <button className="icon-btn sm" title="Nuevo proyecto" onClick={() => setCreating(true)}>
              <Ico icon={Plus} size={14} />
            </button>
          </div>
          {projects.map((p) => (
            <NavLink
              key={p.id}
              to={`/p/${p.id}`}
              className={() => `side-item${p.id === projectId ? " active" : ""}`}
            >
              <span className="tree-icon">
                <ProjectIcon project={p} />
              </span>
              <span className="ellipsis">{p.name}</span>
            </NavLink>
          ))}
          {projects.length === 0 && <div className="muted small pad">Sin proyectos todavía</div>}
        </div>
        {sidebar && <div className="side-section grow">{sidebar}</div>}
        <div className="side-foot">
          <span className="avatar sm">{(me.display_name || me.username).slice(0, 1).toUpperCase()}</span>
          <span className="ellipsis" title={me.username}>
            {me.display_name || me.username}
          </span>
          {me.role === "admin" && (
            <Link to="/admin" className="icon-btn" title="Administración">
              <Ico icon={Settings} />
            </Link>
          )}
          <button className="icon-btn" title="Cerrar sesión" onClick={() => supabase.auth.signOut()}>
            <Ico icon={LogOut} />
          </button>
        </div>
      </aside>
      {collapsed && (
        <button className="side-open icon-btn" title="Mostrar barra" onClick={toggle}>
          <Ico icon={PanelLeftOpen} />
        </button>
      )}
      <main className="main">
        <ProjectsCtx.Provider value={{ projects, reload, create: () => setCreating(true) }}>
          {children}
        </ProjectsCtx.Provider>
      </main>
      {creating && (
        <PromptModal
          title="Nuevo proyecto"
          placeholder="Nombre del proyecto"
          okLabel="Crear"
          onSubmit={createProject}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
};
