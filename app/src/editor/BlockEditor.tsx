import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { es } from "@blocknote/core/locales";
import {
  SuggestionMenuController,
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { ArrowRight, ArrowUpRight } from "lucide-react";

import { openLink } from "../lib/links";
import { Ico, KindIcon, PageIcon } from "../ui/icons";
import { useProject } from "../lib/projectStore";
import { errMsg, supabase } from "../lib/supabase";
import type { Page, PageKind } from "../lib/supabase";
import { useAddPage } from "../pages/useAddPage";
import { useToast } from "../ui/toast";
import { CanvasThumb } from "./CanvasThumb";

// ---- Bloque "página incrustada": pizarra (con miniatura), link, nota o tarea ----
const PageEmbed = ({ pageId }: { pageId: string }) => {
  const { pages, project } = useProject();
  const nav = useNavigate();
  const p = pages.get(pageId);
  if (!p) return <div className="embed missing muted small">Página eliminada</div>;
  const go = () => (p.kind === "link" ? openLink(p.url) : nav(`/p/${project.id}/${p.id}`));
  return (
    <div className={`embed embed-${p.kind}`} contentEditable={false} onClick={go} role="link">
      <div className="embed-head">
        <PageIcon page={p} />
        <span className="grow ellipsis">{p.title || "Sin título"}</span>
        <span className="muted small row gap-xs">
          Abrir <Ico icon={p.kind === "link" ? ArrowUpRight : ArrowRight} size={13} />
        </span>
      </div>
      {p.kind === "canvas" && p.drawing_id && (
        <CanvasThumb drawingId={p.drawing_id} updatedAt={p.updated_at} />
      )}
      {p.kind === "link" && <div className="muted small ellipsis">{p.url}</div>}
    </div>
  );
};

const pageBlock = createReactBlockSpec(
  { type: "page", propSchema: { pageId: { default: "" } }, content: "none" },
  { render: ({ block }) => <PageEmbed pageId={block.props.pageId} /> },
)();

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, page: pageBlock },
});

type Props = { page: Page; childKinds: PageKind[] };

const BlockEditor = ({ page, childKinds }: Props) => {
  const { canEdit } = useProject();
  const toast = useToast();
  const [initial, setInitial] = useState<any[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    supabase
      .from("pages")
      .select("content")
      .eq("id", page.id)
      .single()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) toast("No se pudo cargar el contenido: " + errMsg(error));
        const c = data?.content;
        setInitial(Array.isArray(c) && c.length ? c : null);
      });
    return () => {
      alive = false;
    };
  }, [page.id, toast]);

  if (initial === undefined) return <div className="muted small pad">Cargando…</div>;
  return <EditorInner page={page} initial={initial} canEdit={canEdit} childKinds={childKinds} />;
};

const EditorInner = ({
  page,
  initial,
  canEdit,
  childKinds,
}: Props & { initial: any[] | null; canEdit: boolean }) => {
  const toast = useToast();
  const { add, modal } = useAddPage();
  const editor = useCreateBlockNote({
    schema,
    dictionary: es as any,
    initialContent: initial ?? undefined,
  });
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  const save = async () => {
    if (!dirty.current) return;
    dirty.current = false;
    const { error } = await supabase
      .from("pages")
      .update({ content: editor.document })
      .eq("id", page.id);
    if (error) {
      dirty.current = true;
      toast("No se pudo guardar el contenido: " + errMsg(error));
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timer.current);
      saveRef.current();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  const insertPage = (p: Page) => {
    const cur = editor.getTextCursorPosition().block;
    const block = { type: "page" as const, props: { pageId: p.id } };
    const isEmpty = Array.isArray(cur.content) && cur.content.length === 0 && cur.type === "paragraph";
    if (isEmpty) editor.replaceBlocks([cur], [block]);
    else editor.insertBlocks([block], cur, "after");
  };

  const createAndEmbed = (kind: PageKind) =>
    add(kind, page.id, { open: false, onCreated: insertPage });

  const custom: DefaultReactSuggestionItem[] = [
    ...(childKinds.includes("canvas")
      ? [{ title: "Pizarra Excalidraw", subtext: "Crea una pizarra dentro de esta página", aliases: ["pizarra", "excalidraw", "dibujo", "canvas"], group: "Páginas", icon: <KindIcon kind="canvas" size={18} />, onItemClick: () => createAndEmbed("canvas") }]
      : []),
    ...(childKinds.includes("link")
      ? [{ title: "Link / Google Sheets o Docs", subtext: "Enlace que se abre en otra pestaña", aliases: ["link", "sheet", "doc", "google", "enlace"], group: "Páginas", icon: <KindIcon kind="link" size={18} />, onItemClick: () => createAndEmbed("link") }]
      : []),
    ...(childKinds.includes("doc")
      ? [{ title: "Subpágina", subtext: "Nota dentro de esta página", aliases: ["pagina", "nota", "doc"], group: "Páginas", icon: <KindIcon kind="doc" size={18} />, onItemClick: () => createAndEmbed("doc") }]
      : []),
    ...(childKinds.includes("task") && page.kind === "task"
      ? [{ title: "Subtarea", subtext: "Agrega una subtarea", aliases: ["subtarea", "tarea", "task"], group: "Páginas", icon: <KindIcon kind="task" size={18} />, onItemClick: () => createAndEmbed("task") }]
      : []),
    ...(childKinds.includes("task_db")
      ? [{ title: "Base de tareas", subtext: "Tareas con lista, tablero y cronograma", aliases: ["tareas", "base", "kanban", "gantt"], group: "Páginas", icon: <KindIcon kind="task_db" size={18} />, onItemClick: () => createAndEmbed("task_db") }]
      : []),
  ];

  return (
    <div className="block-editor">
      <BlockNoteView
        editor={editor}
        editable={canEdit}
        theme="light"
        slashMenu={false}
        onChange={() => {
          dirty.current = true;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => saveRef.current(), 800);
        }}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems([...custom, ...getDefaultReactSlashMenuItems(editor)], query)
          }
        />
      </BlockNoteView>
      {modal}
    </div>
  );
};

export default BlockEditor;
