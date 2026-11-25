import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useProject } from "../lib/projectStore";
import { PageIcon, ProjectIcon } from "../ui/icons";
import type { Page } from "../lib/supabase";
import { ancestors } from "../lib/tree";

export const Breadcrumb = ({ page }: { page: Page }) => {
  const { project, pages } = useProject();
  const trail = ancestors(pages, page.parent_id);
  return (
    <nav className="crumbs">
      <Link to={`/p/${project.id}`}>
        <ProjectIcon project={project} size={14} /> {project.name}
      </Link>
      {trail.map((a) => (
        <span key={a.id} className="crumb">
          <span className="sep">/</span>
          <Link to={`/p/${project.id}/${a.id}`}>
            <PageIcon page={a} size={14} /> {a.title || "Sin título"}
          </Link>
        </span>
      ))}
    </nav>
  );
};

/** Título editable en línea (se guarda al salir o con Enter). */
export const EditableTitle = ({
  value,
  onSave,
  disabled,
  className = "page-title",
  placeholder = "Sin título",
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim();
    if (t !== value) onSave(t);
  };
  return (
    <input
      className={`title-input ${className}`}
      value={v}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
};

export const PageHeader = ({
  page,
  actions,
  done,
}: {
  page: Page;
  actions?: ReactNode;
  done?: boolean;
}) => {
  const { updatePage, canEdit } = useProject();
  return (
    <header className="page-header">
      <div className="row between">
        <Breadcrumb page={page} />
        <div className="row">{actions}</div>
      </div>
      <div className="title-row">
        <span className="title-icon">
          <PageIcon page={page} done={done} size={30} />
        </span>
        <EditableTitle
          value={page.title}
          disabled={!canEdit}
          onSave={(title) => updatePage(page.id, { title })}
        />
      </div>
    </header>
  );
};
