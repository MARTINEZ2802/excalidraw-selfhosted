import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";

import "@fontsource-variable/inter";
import "./styles.css";
import { AuthGate, useSession } from "./auth/AuthGate";
import { Shell } from "./layout/Shell";
import { ProjectProvider } from "./lib/projectStore";
import { Home } from "./pages/Home";
import { ProjectHome } from "./pages/ProjectHome";
import { PageView } from "./pages/PageView";
import { PageTree } from "./sidebar/PageTree";
import { ToastProvider } from "./ui/toast";

const AdminPanel = lazy(() => import("./admin/AdminPanel"));

const ProjectRoute = () => {
  const { projectId, pageId } = useParams();
  return (
    <ProjectProvider key={projectId} projectId={projectId!}>
      <Shell sidebar={<PageTree />}>
        {pageId ? <PageView key={pageId} pageId={pageId} /> : <ProjectHome />}
      </Shell>
    </ProjectProvider>
  );
};

const AdminRoute = () => {
  const { me } = useSession();
  if (me.role !== "admin") return <Navigate to="/" replace />;
  return (
    <Shell>
      <Suspense fallback={<div className="center muted">Cargando…</div>}>
        <AdminPanel />
      </Suspense>
    </Shell>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <AuthGate>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <Shell>
                  <Home />
                </Shell>
              }
            />
            <Route path="/p/:projectId/:pageId?" element={<ProjectRoute />} />
            <Route path="/admin" element={<AdminRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
);
