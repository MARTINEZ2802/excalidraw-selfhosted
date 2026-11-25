import {
  Folder,
  FileSpreadsheet,
  FileText,
  Link as LinkGlyph,
  ListChecks,
  PenTool,
  Presentation,
  Square,
  SquareCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { LinkKind, Page, PageKind, Project } from "../lib/supabase";

/** Iconos de línea (estilo SF Symbols). Tamaño y trazo uniformes en toda la app. */
export const ICON = { size: 16, stroke: 1.75 } as const;

export const Ico = ({ icon: I, size = ICON.size, className }: { icon: LucideIcon; size?: number; className?: string }) => (
  <I size={size} strokeWidth={ICON.stroke} className={`ico${className ? ` ${className}` : ""}`} aria-hidden />
);

const KIND: Record<PageKind, LucideIcon> = {
  task_db: ListChecks,
  task: Square,
  canvas: PenTool,
  doc: FileText,
  link: LinkGlyph,
};
const LINK: Record<LinkKind, LucideIcon> = {
  gsheet: FileSpreadsheet,
  gdoc: FileText,
  gslides: Presentation,
  other: LinkGlyph,
};

export const kindIcon = (kind: PageKind, linkKind?: LinkKind | null, done?: boolean): LucideIcon =>
  kind === "link" ? LINK[linkKind ?? "other"] : kind === "task" && done ? SquareCheck : KIND[kind];

/** Ícono de página: el emoji que eligió el usuario o, si no hay, el ícono de línea de su tipo. */
export const PageIcon = ({
  page,
  done,
  size,
}: {
  page: Pick<Page, "kind" | "icon" | "link_kind">;
  done?: boolean;
  size?: number;
}) =>
  page.icon ? (
    <span className="emoji" style={size ? { fontSize: size } : undefined}>
      {page.icon}
    </span>
  ) : (
    <Ico icon={kindIcon(page.kind, page.link_kind, done)} size={size} className={done ? "ico-done" : undefined} />
  );

export const KindIcon = ({ kind, size }: { kind: PageKind; size?: number }) => (
  <Ico icon={kindIcon(kind)} size={size} />
);

export const ProjectIcon = ({ project, size }: { project: Pick<Project, "icon">; size?: number }) =>
  project.icon ? (
    <span className="emoji" style={size ? { fontSize: size } : undefined}>
      {project.icon}
    </span>
  ) : (
    <Ico icon={Folder} size={size} />
  );
