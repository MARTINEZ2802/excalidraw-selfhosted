import type { ChildMap } from "./tree";
import type { DbProperty, Page } from "./supabase";

export const doneStatusIds = (statusProp?: DbProperty) =>
  new Set((statusProp?.options ?? []).filter((o) => o.done).map((o) => o.id));

/**
 * Avance de cada tarea:
 *  - hoja: 100 si su estado está marcado como "hecho"; si no, su avance manual.
 *  - padre: promedio del avance de sus subtareas (recursivo).
 */
export const computeProgress = (
  tasks: Page[],
  children: ChildMap,
  done: Set<string>,
) => {
  const memo = new Map<string, number>();
  const calc = (t: Page): number => {
    if (memo.has(t.id)) return memo.get(t.id)!;
    const subs = (children.get(t.id) ?? []).filter((c) => c.kind === "task");
    const v = subs.length
      ? Math.round(subs.reduce((s, c) => s + calc(c), 0) / subs.length)
      : t.status && done.has(t.status)
        ? 100
        : t.progress;
    memo.set(t.id, v);
    return v;
  };
  for (const t of tasks) calc(t);
  return memo;
};

export const hasSubtasks = (children: ChildMap, id: string) =>
  (children.get(id) ?? []).some((c) => c.kind === "task");
