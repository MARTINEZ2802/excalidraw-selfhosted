import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

import { useSession } from "../auth/AuthGate";
import { useProjects } from "../layout/Shell";
import { Ico, ProjectIcon } from "../ui/icons";

export const Home = () => {
  const { me } = useSession();
  const { projects, create } = useProjects();
  return (
    <div className="page-wrap">
      <h1 className="page-title hero">Hola, {me.display_name || me.username}.</h1>
      <p className="lead muted">Elige un proyecto o crea uno nuevo.</p>
      <div className="cards">
        {projects.map((p) => (
          <Link key={p.id} to={`/p/${p.id}`} className="card">
            <div className="card-icon">
              <ProjectIcon project={p} size={22} />
            </div>
            <div className="card-title">{p.name}</div>
            {p.description && <div className="muted small">{p.description}</div>}
          </Link>
        ))}
        <button className="card add" onClick={create}>
          <div className="card-icon">
            <Ico icon={Plus} size={22} />
          </div>
          <div className="card-title">Nuevo proyecto</div>
        </button>
      </div>
      {projects.length === 0 && (
        <p className="muted">
          Todavía no participas en ningún proyecto. Crea uno o pide a alguien que te agregue.
        </p>
      )}
    </div>
  );
};
