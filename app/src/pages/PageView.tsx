import { Suspense, lazy } from "react";

import { useProject } from "../lib/projectStore";
import { LinkPage } from "./LinkPage";

const CanvasPage = lazy(() => import("../canvas/CanvasPage"));
const DocPage = lazy(() => import("./DocPage"));
const TaskPage = lazy(() => import("../tasks/TaskPage"));
const TaskDatabase = lazy(() => import("../tasks/TaskDatabase"));

export const PageView = ({ pageId }: { pageId: string }) => {
  const { pages } = useProject();
  const page = pages.get(pageId);
  if (!page) return <div className="center muted">Página no encontrada o eliminada.</div>;

  const view = (() => {
    switch (page.kind) {
      case "canvas":
        return <CanvasPage page={page} />;
      case "doc":
        return <DocPage page={page} />;
      case "task":
        return <TaskPage page={page} />;
      case "task_db":
        return <TaskDatabase db={page} />;
      case "link":
        return <LinkPage page={page} />;
    }
  })();
  return <Suspense fallback={<div className="center muted">Cargando…</div>}>{view}</Suspense>;
};
