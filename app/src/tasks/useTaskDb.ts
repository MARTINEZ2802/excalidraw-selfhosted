import { useCallback, useMemo } from "react";

import { computeProgress, doneStatusIds, hasSubtasks } from "../lib/progress";
import { useProject } from "../lib/projectStore";
import type { DbProperty, Page, ViewConfig } from "../lib/supabase";

/** Todo lo que las vistas necesitan de una base de tareas. */
export const useTaskDb = (dbId: string) => {
  const store = useProject();
  const { pages, children, updatePage } = store;
  const properties = store.properties(dbId);
  const statusProp = properties.find((p) => p.type === "status");
  const customProps = properties.filter((p) => p.type !== "status");

  const tasks = useMemo(
    () => [...pages.values()].filter((p) => p.kind === "task" && p.db_id === dbId),
    [pages, dbId],
  );
  const done = useMemo(() => doneStatusIds(statusProp), [statusProp]);
  const progress = useMemo(() => computeProgress(tasks, children, done), [tasks, children, done]);

  const subtasks = useCallback(
    (id: string) => (children.get(id) ?? []).filter((c) => c.kind === "task"),
    [children],
  );
  const isParent = useCallback((id: string) => hasSubtasks(children, id), [children]);
  const isDone = useCallback((t: Page) => !!t.status && done.has(t.status), [done]);

  const getValue = useCallback(
    (t: Page, prop: DbProperty) => (prop.type === "status" ? t.status : t.props?.[prop.id] ?? null),
    [],
  );
  const setValue = useCallback(
    (t: Page, prop: DbProperty, v: unknown) =>
      prop.type === "status"
        ? updatePage(t.id, { status: (v as string) ?? null })
        : updatePage(t.id, { props: { ...t.props, [prop.id]: v } }),
    [updatePage],
  );

  /** Marca/desmarca como hecha (usa la primera opción "hecho" o vuelve a la primera opción). */
  const toggleDone = useCallback(
    (t: Page) => {
      const opts = statusProp?.options ?? [];
      const next = isDone(t) ? opts.find((o) => !o.done)?.id : opts.find((o) => o.done)?.id;
      if (next) updatePage(t.id, { status: next });
    },
    [statusProp, isDone, updatePage],
  );

  /** Filtros de la vista: oculta hechas, filtra por responsable. Conserva ancestros de las coincidencias. */
  const applyFilters = useCallback(
    (list: Page[], cfg: ViewConfig) => {
      const match = (t: Page) =>
        (cfg.show_done !== false || !isDone(t)) &&
        (!cfg.filter_assignee || t.assignees.includes(cfg.filter_assignee));
      if (cfg.show_done !== false && !cfg.filter_assignee) return list;
      const keep = new Set<string>();
      for (const t of list) {
        if (!match(t)) continue;
        let cur: Page | undefined = t;
        while (cur && cur.kind === "task") {
          keep.add(cur.id);
          cur = cur.parent_id ? pages.get(cur.parent_id) : undefined;
        }
      }
      return list.filter((t) => keep.has(t.id));
    },
    [isDone, pages],
  );

  return {
    tasks,
    properties,
    statusProp,
    customProps,
    done,
    progress,
    subtasks,
    isParent,
    isDone,
    getValue,
    setValue,
    toggleDone,
    applyFilters,
  };
};
export type TaskDb = ReturnType<typeof useTaskDb>;
