import { useEffect, useState } from "react";

import { loadScene } from "../canvas/scene";

const cache = new Map<string, string>(); // `${drawingId}@${updatedAt}` -> svg

/** Miniatura SVG de una pizarra (se regenera cuando cambia updatedAt). */
export const CanvasThumb = ({ drawingId, updatedAt }: { drawingId: string; updatedAt: string }) => {
  const key = `${drawingId}@${updatedAt}`;
  const [svg, setSvg] = useState(cache.get(key) ?? "");
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (cache.has(key)) return;
    let alive = true;
    (async () => {
      const [{ exportToSvg }, { scene, files }] = await Promise.all([
        import("@excalidraw/excalidraw"),
        loadScene(drawingId),
      ]);
      const elements = (scene.elements || []).filter((e: any) => !e.isDeleted);
      if (!elements.length) {
        if (alive) setEmpty(true);
        return;
      }
      const el = await exportToSvg({
        elements,
        appState: {
          exportBackground: true,
          viewBackgroundColor: scene.appState?.viewBackgroundColor ?? "#ffffff",
        } as any,
        files: files as any,
        exportPadding: 12,
      });
      el.removeAttribute("width");
      el.removeAttribute("height");
      const html = el.outerHTML;
      cache.set(key, html);
      if (alive) setSvg(html);
    })().catch(() => alive && setEmpty(true));
    return () => {
      alive = false;
    };
  }, [key, drawingId]);

  if (empty) return <div className="thumb empty muted small">Pizarra vacía</div>;
  if (!svg) return <div className="thumb loading muted small">Cargando vista previa…</div>;
  // SVG generado por exportToSvg (construido con APIs DOM, textos escapados)
  return <div className="thumb" dangerouslySetInnerHTML={{ __html: svg }} />;
};
