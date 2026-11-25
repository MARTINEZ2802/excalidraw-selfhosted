import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// Supabase Auth exige email: el login por usuario usa un dominio interno.
export const toEmail = (username: string) =>
  `${username.trim().toLowerCase()}@excalidraw.local`;

export const BUCKET = "drawing-files";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  role: "admin" | "user";
};
export type UserLite = Pick<Profile, "id" | "username" | "display_name">;

export type Role = "owner" | "editor" | "viewer";
export type Project = {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  created_by: string | null;
};
export type Member = { project_id: string; user_id: string; role: Role };

export type PageKind = "task_db" | "task" | "canvas" | "doc" | "link";
export type LinkKind = "gsheet" | "gdoc" | "gslides" | "other";

/** Página sin `content` (el contenido se carga al abrirla). */
export type Page = {
  id: string;
  project_id: string;
  parent_id: string | null;
  kind: PageKind;
  title: string;
  icon: string | null;
  position: number;
  url: string | null;
  link_kind: LinkKind | null;
  drawing_id: string | null;
  db_id: string | null;
  status: string | null;
  assignees: string[];
  start_date: string | null;
  due_date: string | null;
  progress: number;
  props: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
export const PAGE_COLUMNS =
  "id,project_id,parent_id,kind,title,icon,position,url,link_kind,drawing_id,db_id,status,assignees,start_date,due_date,progress,props,created_at,updated_at";

export type PropType =
  | "status"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "person"
  | "checkbox"
  | "url";
export type PropOption = { id: string; name: string; color: string; done?: boolean };
export type DbProperty = {
  id: string;
  db_id: string;
  name: string;
  type: PropType;
  options: PropOption[];
  position: number;
  system: boolean;
};

export type ViewType = "list" | "kanban" | "gantt" | "calendar";
export type ViewConfig = {
  group_by?: string; // "status" | property id
  hidden?: string[]; // property ids ocultas
  filter_status?: string[]; // ids de estado visibles (vacío = todos)
  filter_assignee?: string | null;
  sort?: "position" | "due_date" | "start_date" | "title";
  scale?: "day" | "week" | "month";
  show_done?: boolean;
};
export type DbView = {
  id: string;
  db_id: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  position: number;
};

export const errMsg = (e: unknown) =>
  e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e);
