import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { MONTHS, dayDate, fromDay, toDay, todayDay } from "../lib/dates";
import { useProject } from "../lib/projectStore";
import type { DbView, Page } from "../lib/supabase";
import type { TaskDb } from "./useTaskDb";

const PX: Record<NonNullable<DbView["config"]["scale"]>, number> = { day: 34, week: 14, month: 4 };
const NAME_W = 280;

type Range = { s: number; e: number } | null;
type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; s0: number; e0: number; dx: number };

export const GanttView = ({ db, view, tdb }: { db: Page; view: DbView; tdb: TaskDb }) => {
  const { project, canEdit, updatePage } = useProject();
  const nav = useNavigate();
  const scale = view.config.scale ?? "week";
  const px = PX[scale];
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => new Set(tdb.applyFilters(tdb.tasks, view.config).map((t) => t.id)),
    [tdb, view.config],
  );

  // Rango propio o, si tiene subtareas con fechas, el que cubren sus hijas
  const ranges = useMemo(() => {
    const memo = new Map<string, Range>();
    const calc = (t: Page): Range => {
      if (memo.has(t.id)) return memo.get(t.id)!;
      let r: Range = null;
      const subs = tdb.subtasks(t.id);
      for (const c of subs) {
        const cr = calc(c);
        if (cr) r = r ? { s: Math.min(r.s, cr.s), e: Math.max(r.e, cr.e) } : { ...cr };
      }
      if (!r) {
        const s = t.start_date ?? t.due_date;
        const e = t.due_date ?? t.start_date;
        r = s && e ? { s: toDay(s), e: toDay(e) } : null;
      }
      memo.set(t.id, r);
      return r;
    };
    for (const t of tdb.tasks) calc(t);
    return memo;
  }, [tdb]);

  const rows = useMemo(() => {
    const out: { t: Page; depth: number }[] = [];
    const walk = (pid: string, depth: number) => {
      for (const t of tdb.subtasks(pid).sort((a, b) => a.position - b.position)) {
        if (!visible.has(t.id)) continue;
        out.push({ t, depth });
        if (!collapsed.has(t.id)) walk(t.id, depth + 1);
      }
    };
    walk(db.id, 0);
    return out;
  }, [tdb, db.id, visible, collapsed]);

  const today = todayDay();
  const [from, to] = useMemo(() => {
    let lo = today - 7;
    let hi = today + 35;
    for (const r of ranges.values()) {
      if (!r) continue;
      lo = Math.min(lo, r.s - 7);
      hi = Math.max(hi, r.e + 21);
    }
    // alinear a lunes
    const dow = (dayDate(lo).getUTCDay() + 6) % 7;
    return [lo - dow, hi];
  }, [ranges, today]);
  const days = to - from + 1;
  const width = days * px;

  // Llevar "hoy" a la vista al abrir / cambiar escala
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, (today - from) * px - 120);
  }, [scale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Encabezados
  const months: { label: string; x: number; w: number }[] = [];
  const ticks: { label: string; x: number }[] = [];
  for (let d = from; d <= to; d++) {
    const dt = dayDate(d);
    if (dt.getUTCDate() === 1 || d === from) {
      const nextMonth = toDay(fromDay(Math.round(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / 86_400_000)));
      const end = Math.min(to + 1, nextMonth);
      months.push({ label: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`, x: (d - from) * px, w: (end - d) * px });
    }
    if (scale === "day") ticks.push({ label: String(dt.getUTCDate()), x: (d - from) * px });
    else if (scale === "week" && dt.getUTCDay() === 1) ticks.push({ label: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`, x: (d - from) * px });
  }
  const gridStep = scale === "day" ? px : scale === "week" ? px * 7 : px * 30;

  // ---- Arrastre ----
  const startDrag = (e: React.PointerEvent, t: Page, mode: Drag["mode"], r: NonNullable<Range>) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: t.id, mode, x0: e.clientX, s0: r.s, e0: r.e, dx: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = Math.round((e.clientX - drag.x0) / px);
    if (dx !== drag.dx) setDrag({ ...drag, dx });
  };
  const preview = (d: Drag): { s: number; e: number } => {
    if (d.mode === "move") return { s: d.s0 + d.dx, e: d.e0 + d.dx };
    if (d.mode === "start") return { s: Math.min(d.s0 + d.dx, d.e0), e: d.e0 };
    return { s: d.s0, e: Math.max(d.e0 + d.dx, d.s0) };
  };
  const endDrag = (t: Page) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.dx === 0) {
      nav(`/p/${project.id}/${t.id}`);
      return;
    }
    const r = preview(d);
    updatePage(t.id, { start_date: fromDay(r.s), due_date: fromDay(r.e) });
  };

  const assignAt = (e: React.MouseEvent, t: Page) => {
    if (!canEdit || tdb.isParent(t.id)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const day = from + Math.floor((e.clientX - rect.left) / px);
    const len = scale === "day" ? 2 : scale === "week" ? 6 : 13;
    updatePage(t.id, { start_date: fromDay(day), due_date: fromDay(day + len) });
  };

  return (
    <div className="gantt" ref={scroller}>
      <div className="g-inner" style={{ width: NAME_W + width }}>
        {/* Encabezado */}
        <div className="g-row g-head">
          <div className="g-name g-head-name">
            <span>Tarea</span>
            <button
              className="btn sm"
              onClick={() => scroller.current && (scroller.current.scrollLeft = Math.max(0, (today - from) * px - 120))}
            >
              Hoy
            </button>
          </div>
          <div className="g-track" style={{ width }}>
            {months.map((m) => (
              <div key={m.x} className="g-month" style={{ left: m.x, width: m.w }}>
                {m.label}
              </div>
            ))}
            {ticks.map((tk) => (
              <div key={tk.x} className="g-tick" style={{ left: tk.x, width: scale === "day" ? px : px * 7 }}>
                {tk.label}
              </div>
            ))}
          </div>
        </div>

        {rows.map(({ t, depth }) => {
          const parent = tdb.isParent(t.id);
          const base = ranges.get(t.id) ?? null;
          const r = drag?.id === t.id ? preview(drag) : base;
          const prog = tdb.progress.get(t.id) ?? 0;
          const derived = parent && tdb.subtasks(t.id).some((c) => ranges.get(c.id));
          const subsCount = tdb.subtasks(t.id).filter((c) => visible.has(c.id)).length;
          return (
            <Fragment key={t.id}>
              <div className="g-row">
                <div className="g-name" style={{ paddingLeft: 8 + depth * 16 }}>
                  <button
                    className={`caret${subsCount ? "" : " hidden"}${collapsed.has(t.id) ? "" : " open"}`}
                    onClick={() =>
                      setCollapsed((s) => {
                        const n = new Set(s);
                        if (n.has(t.id)) n.delete(t.id);
                        else n.add(t.id);
                        return n;
                      })
                    }
                  >
                    ▸
                  </button>
                  <span
                    className={`ellipsis grow task-title${tdb.isDone(t) ? " done-text" : ""}`}
                    onClick={() => nav(`/p/${project.id}/${t.id}`)}
                    title={t.title}
                  >
                    {t.title || "Sin título"}
                  </span>
                  <span className="muted small">{prog}%</span>
                </div>
                <div
                  className={`g-track${!r && canEdit && !parent ? " assignable" : ""}`}
                  style={{
                    width,
                    backgroundImage: `repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px ${gridStep}px)`,
                  }}
                  onClick={(e) => !r && assignAt(e, t)}
                  title={!r && canEdit && !parent ? "Clic para asignar fechas" : undefined}
                >
                  {today >= from && today <= to && <div className="g-today" style={{ left: (today - from) * px + px / 2 }} />}
                  {r && (
                    <div
                      className={`g-bar${derived ? " summary" : ""}${tdb.isDone(t) ? " done" : ""}${drag?.id === t.id ? " dragging" : ""}`}
                      style={{ left: (r.s - from) * px, width: Math.max(px, (r.e - r.s + 1) * px) }}
                      title={`${t.title}\n${fromDay(r.s)} → ${fromDay(r.e)} · ${prog}%`}
                      onPointerDown={(e) => !derived && startDrag(e, t, "move", base!)}
                      onPointerMove={onMove}
                      onPointerUp={() => (derived ? nav(`/p/${project.id}/${t.id}`) : endDrag(t))}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="g-fill" style={{ width: `${prog}%` }} />
                      {!derived && canEdit && (
                        <>
                          <span className="g-handle l" onPointerDown={(e) => startDrag(e, t, "start", base!)} />
                          <span className="g-handle r" onPointerDown={(e) => startDrag(e, t, "end", base!)} />
                        </>
                      )}
                      <span className="g-label">{(r.e - r.s + 1) * px > 70 ? t.title : ""}</span>
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
        {rows.length === 0 && <div className="muted pad">No hay tareas. Créalas en la vista de lista.</div>}
      </div>
    </div>
  );
};
