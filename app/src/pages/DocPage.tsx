import { Suspense, lazy } from "react";

import type { Page } from "../lib/supabase";
import { PageHeader } from "./PageHeader";
import { childKinds } from "./useAddPage";

const BlockEditor = lazy(() => import("../editor/BlockEditor"));

const DocPage = ({ page }: { page: Page }) => (
  <div className="page-wrap">
    <PageHeader page={page} />
    <div className="muted small hint">Escribe “/” para insertar bloques, pizarras o links.</div>
    <Suspense fallback={<div className="muted small pad">Cargando editor…</div>}>
      <BlockEditor key={page.id} page={page} childKinds={childKinds(page)} />
    </Suspense>
  </div>
);

export default DocPage;
