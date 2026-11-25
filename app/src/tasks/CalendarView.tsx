import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";

import { fromDay, toDay } from "../lib/dates";
import { useProject } from "../lib/projectStore";
import type { DbView, Page } from "../lib/supabase";
import type { TaskDb } from "./useTaskDb";

const COLOR: Record<string, string> = {
  gray: "#868e96", brown: "#a0785a", orange: "#f08c00", yellow: "#e0a800", green: "#2f9e44",
  blue: "#1c7ed6", purple: "#7048e8", pink: "#d6336c", red: "#e03131",
};

const CalendarView = ({ db, view, tdb }: { db: Page; view: DbView; tdb: TaskDb }) => {
  const { project, canEdit, createPage, updatePage, pages } = useProject();
  const nav = useNavigate();

  const events = useMemo(
    () =>
      tdb
        .applyFilters(tdb.tasks, view.config)
        .filter((t) => t.start_date || t.due_date)
        .map((t) => {
          const s = t.start_date ?? t.due_date!;
          const e = t.due_date ?? t.start_date!;
          const opt = tdb.statusProp?.options.find((o) => o.id === t.status);
          return {
            id: t.id,
            title: (tdb.isDone(t) ? "✓ " : "") + (t.title || "Sin título"),
            start: s,
            end: fromDay(toDay(e) + 1), // fin exclusivo
            allDay: true,
            backgroundColor: COLOR[opt?.color ?? "blue"] ?? COLOR.blue,
            borderColor: "transparent",
            classNames: tdb.isDone(t) ? ["ev-done"] : [],
          };
        }),
    [tdb, view.config],
  );

  return (
    <div className="calendar">
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={esLocale}
        height="auto"
        firstDay={1}
        events={events}
        editable={canEdit}
        eventResizableFromStart={canEdit}
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek" }}
        eventClick={(info) => nav(`/p/${project.id}/${info.event.id}`)}
        eventDrop={(info) => {
          const t = pages.get(info.event.id);
          if (!t) return;
          const start = info.event.startStr.slice(0, 10);
          const end = info.event.endStr ? fromDay(toDay(info.event.endStr.slice(0, 10)) - 1) : start;
          // conservar qué fechas tenía (solo inicio, solo fin o ambas)
          updatePage(t.id, {
            start_date: t.start_date ? start : null,
            due_date: t.due_date ? end : null,
          });
        }}
        eventResize={(info) => {
          const start = info.event.startStr.slice(0, 10);
          const endEx = info.event.endStr.slice(0, 10);
          updatePage(info.event.id, { start_date: start, due_date: fromDay(toDay(endEx) - 1) });
        }}
        dateClick={async (info) => {
          if (!canEdit) return;
          const title = window.prompt(`Nueva tarea para el ${info.dateStr}`)?.trim();
          if (title) await createPage({ kind: "task", parent_id: db.id, title, due_date: info.dateStr, start_date: info.dateStr });
        }}
      />
    </div>
  );
};

export default CalendarView;
