import type { Page } from "./supabase";

export type ChildMap = Map<string | null, Page[]>;

export const byPosition = (a: Page, b: Page) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

export const buildChildren = (pages: Page[]): ChildMap => {
  const m: ChildMap = new Map();
  for (const p of pages) {
    const k = p.parent_id;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  for (const list of m.values()) list.sort(byPosition);
  return m;
};

/** Posición fraccional entre dos vecinos (para reordenar sin renumerar). */
export const positionBetween = (before?: number, after?: number) => {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
};

export const nextPosition = (siblings: Page[]) =>
  siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 1;

export const ancestors = (pages: Map<string, Page>, id: string | null) => {
  const out: Page[] = [];
  let cur = id ? pages.get(id) : undefined;
  while (cur) {
    out.unshift(cur);
    cur = cur.parent_id ? pages.get(cur.parent_id) : undefined;
  }
  return out;
};

export const descendants = (children: ChildMap, id: string) => {
  const out: Page[] = [];
  const walk = (pid: string) => {
    for (const c of children.get(pid) ?? []) {
      out.push(c);
      walk(c.id);
    }
  };
  walk(id);
  return out;
};

/** ¿Puede `kind` colgar de `parent`? (mismas reglas que el trigger pages_validate) */
export const canNest = (kind: Page["kind"], parent: Page | null) => {
  if (kind === "task") return !!parent && (parent.kind === "task_db" || parent.kind === "task");
  if (parent?.kind === "task_db") return false; // dentro de una base solo van tareas
  return true;
};
