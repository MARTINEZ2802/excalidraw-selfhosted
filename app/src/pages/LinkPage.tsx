import { useState } from "react";

import { ArrowUpRight } from "lucide-react";

import { detectLinkKind, normalizeUrl, openLink } from "../lib/links";
import { Ico, PageIcon } from "../ui/icons";
import { useProject } from "../lib/projectStore";
import type { Page } from "../lib/supabase";
import { PageHeader } from "./PageHeader";

const KIND_NAME = {
  gsheet: "Hoja de cálculo de Google",
  gdoc: "Documento de Google",
  gslides: "Presentación de Google",
  other: "Enlace externo",
};

export const LinkPage = ({ page }: { page: Page }) => {
  const { updatePage, canEdit } = useProject();
  const [url, setUrl] = useState(page.url ?? "");
  return (
    <div className="page-wrap">
      <PageHeader page={page} />
      <div className="link-card">
        <div className="link-icon">
          <PageIcon page={page} size={28} />
        </div>
        <div className="grow">
          <div className="muted small">{KIND_NAME[page.link_kind ?? "other"]}</div>
          <a href={page.url ?? "#"} target="_blank" rel="noopener noreferrer" className="link-url">
            {page.url}
          </a>
        </div>
        <button className="btn primary" onClick={() => openLink(page.url)}>
          Abrir <Ico icon={ArrowUpRight} size={15} />
        </button>
      </div>
      {canEdit && (
        <form
          className="form"
          style={{ maxWidth: 560 }}
          onSubmit={(e) => {
            e.preventDefault();
            const u = normalizeUrl(url);
            if (u) updatePage(page.id, { url: u, link_kind: detectLinkKind(u) });
          }}
        >
          <label>Cambiar URL</label>
          <div className="row">
            <input className="grow" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn" disabled={normalizeUrl(url) === page.url}>
              Guardar
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
