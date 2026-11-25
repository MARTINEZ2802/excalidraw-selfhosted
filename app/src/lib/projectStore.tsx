import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { BUCKET, PAGE_COLUMNS, errMsg, supabase } from "./supabase";
import type {
  DbProperty,
  DbView,
  Member,
  Page,
  PageKind,
  Project,
  Role,
} from "./supabase";
import { buildChildren, descendants, nextPosition } from "./tree";
import type { ChildMap } from "./tree";
import { useSession } from "../auth/AuthGate";
import { useToast } from "../ui/toast";

const stripContent = (row: any): Page => {
  const { content: _c, ...rest } = row ?? {};
  return rest as Page;
};

export type NewPage = {
  kind: PageKind;
  parent_id: string | null;
  title?: string;
  url?: string | null;
  link_kind?: Page["link_kind"];
  status?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  position?: number;
  props?: Record<string, unknown>;
  assignees?: string[];
};

type Store = {
  project: Project;
  members: Member[];
  role: Role | null;
  canEdit: boolean;
  canManage: boolean;
  pages: Map<string, Page>;
  children: ChildMap;
  properties: (dbId: string) => DbProperty[];
  views: (dbId: string) => DbView[];
  createPage: (p: NewPage) => Promise<Page | null>;
  updatePage: (id: string, patch: Partial<Page>) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
  updateProject: (patch: Partial<Project>) => Promise<void>;
  reloadMembers: () => Promise<void>;
  reloadDb: () => Promise<void>;
  saveProperty: (p: Partial<DbProperty> & { db_id: string }) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  saveView: (v: Partial<DbView> & { db_id: string }) => Promise<DbView | null>;
  deleteView: (id: string) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);
export const useProject = () => useContext(Ctx)!;

export const ProjectProvider = ({
  projectId,
  children: ui,
}: {
  projectId: string;
  children: ReactNode;
}) => {
  const { me } = useSession();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pages, setPages] = useState<Map<string, Page>>(new Map());
  const [props, setProps] = useState<DbProperty[]>([]);
  const [views, setViews] = useState<DbView[]>([]);
  const [error, setError] = useState("");
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const reloadMembers = useCallback(async () => {
    const { data } = await supabase
      .from("project_members")
      .select("project_id,user_id,role")
      .eq("project_id", projectId);
    setMembers((data as Member[]) ?? []);
  }, [projectId]);

  const reloadDb = useCallback(async () => {
    const [p, v] = await Promise.all([
      supabase.from("db_properties").select("*").eq("project_id", projectId),
      supabase.from("db_views").select("*").eq("project_id", projectId),
    ]);
    setProps(((p.data as DbProperty[]) ?? []).sort((a, b) => a.position - b.position));
    setViews(((v.data as DbView[]) ?? []).sort((a, b) => a.position - b.position));
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    setProject(null);
    setError("");
    (async () => {
      const [pr, pg] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
        supabase.from("pages").select(PAGE_COLUMNS).eq("project_id", projectId),
        reloadMembers(),
        reloadDb(),
      ]);
      if (!alive) return;
      if (pr.error || !pr.data) {
        setError(pr.error ? errMsg(pr.error) : "Proyecto no encontrado o sin acceso");
        return;
      }
      setPages(new Map(((pg.data as unknown as Page[]) ?? []).map((p) => [p.id, p])));
      setProject(pr.data as Project);
    })();

    // Cambios de otros usuarios en vivo
    const ch = supabase
      .channel(`pages:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          setPages((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              next.delete((payload.old as any).id);
            } else {
              const row = stripContent(payload.new);
              next.set(row.id, row);
            }
            return next;
          });
          if (payload.eventType === "INSERT" && (payload.new as any).kind === "task_db") {
            reloadDb();
          }
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [projectId, reloadMembers, reloadDb]);

  const children = useMemo(() => buildChildren([...pages.values()]), [pages]);

  const role: Role | null =
    me.role === "admin"
      ? "owner"
      : (members.find((m) => m.user_id === me.id)?.role ?? null);

  const createPage = useCallback(
    async (p: NewPage) => {
      const siblings = buildChildren([...pagesRef.current.values()]).get(p.parent_id) ?? [];
      const { data, error } = await supabase
        .from("pages")
        .insert({
          project_id: projectId,
          position: p.position ?? nextPosition(siblings),
          title: p.title ?? "",
          ...p,
          ...(p.kind === "task" && p.status === undefined ? { status: "todo" } : {}),
        })
        .select(PAGE_COLUMNS)
        .single();
      if (error || !data) {
        toast("No se pudo crear: " + errMsg(error));
        return null;
      }
      const row = data as unknown as Page;
      // ref al día ya, por si se edita la página recién creada antes del próximo render
      pagesRef.current = new Map(pagesRef.current).set(row.id, row);
      setPages((prev) => new Map(prev).set(row.id, row));
      if (row.kind === "task_db") reloadDb();
      return row;
    },
    [projectId, toast, reloadDb],
  );

  const updatePage = useCallback(
    async (id: string, patch: Partial<Page>) => {
      const before = pagesRef.current.get(id);
      if (!before) return;
      pagesRef.current = new Map(pagesRef.current).set(id, { ...before, ...patch });
      setPages((prev) => {
        const cur = prev.get(id);
        return cur ? new Map(prev).set(id, { ...cur, ...patch }) : prev;
      });
      const { error } = await supabase.from("pages").update(patch).eq("id", id);
      if (error) {
        pagesRef.current = new Map(pagesRef.current).set(id, before);
        setPages((prev) => new Map(prev).set(id, before));
        toast("No se pudo guardar: " + errMsg(error));
      }
    },
    [toast],
  );

  const deletePage = useCallback(
    async (id: string) => {
      const all = pagesRef.current;
      const kids = buildChildren([...all.values()]);
      const subtree = [all.get(id)!, ...descendants(kids, id)].filter(Boolean);
      // Archivos de las pizarras del subárbol (la BD borra los dibujos en cascada)
      for (const p of subtree) {
        if (!p.drawing_id) continue;
        const { data: files } = await supabase.storage.from(BUCKET).list(p.drawing_id);
        if (files?.length) {
          await supabase.storage
            .from(BUCKET)
            .remove(files.map((f) => `${p.drawing_id}/${f.name}`));
        }
      }
      const { error } = await supabase.from("pages").delete().eq("id", id);
      if (error) {
        toast("No se pudo eliminar: " + errMsg(error));
        return;
      }
      setPages((prev) => {
        const next = new Map(prev);
        for (const p of subtree) next.delete(p.id);
        return next;
      });
    },
    [toast],
  );

  const updateProject = useCallback(
    async (patch: Partial<Project>) => {
      const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
      if (error) toast(errMsg(error));
      else setProject((p) => (p ? { ...p, ...patch } : p));
    },
    [projectId, toast],
  );

  const saveProperty = useCallback(
    async (p: Partial<DbProperty> & { db_id: string }) => {
      const { error } = p.id
        ? await supabase.from("db_properties").update(p).eq("id", p.id)
        : await supabase.from("db_properties").insert(p);
      if (error) toast(errMsg(error));
      await reloadDb();
    },
    [toast, reloadDb],
  );
  const deleteProperty = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("db_properties").delete().eq("id", id);
      if (error) toast(errMsg(error));
      await reloadDb();
    },
    [toast, reloadDb],
  );
  const saveView = useCallback(
    async (v: Partial<DbView> & { db_id: string }) => {
      if (v.id) setViews((l) => l.map((x) => (x.id === v.id ? { ...x, ...v } : x)));
      const q = v.id
        ? supabase.from("db_views").update(v).eq("id", v.id)
        : supabase.from("db_views").insert(v);
      const { data, error } = await q.select("*").single();
      if (error) toast(errMsg(error));
      await reloadDb();
      return (data as DbView) ?? null;
    },
    [toast, reloadDb],
  );
  const deleteView = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("db_views").delete().eq("id", id);
      if (error) toast(errMsg(error));
      await reloadDb();
    },
    [toast, reloadDb],
  );

  const value = useMemo<Store | null>(
    () =>
      project && {
        project,
        members,
        role,
        canEdit: role === "owner" || role === "editor",
        canManage: role === "owner",
        pages,
        children,
        properties: (dbId) => props.filter((p) => p.db_id === dbId),
        views: (dbId) => views.filter((v) => v.db_id === dbId),
        createPage,
        updatePage,
        deletePage,
        updateProject,
        reloadMembers,
        reloadDb,
        saveProperty,
        deleteProperty,
        saveView,
        deleteView,
      },
    [project, members, role, pages, children, props, views, createPage, updatePage,
     deletePage, updateProject, reloadMembers, reloadDb, saveProperty, deleteProperty,
     saveView, deleteView],
  );

  if (error) return <div className="center error">{error}</div>;
  if (!value) return <div className="center muted">Cargando proyecto…</div>;
  return <Ctx.Provider value={value}>{ui}</Ctx.Provider>;
};
