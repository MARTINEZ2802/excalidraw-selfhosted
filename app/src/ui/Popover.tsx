import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Popover anclado a un elemento; se cierra con clic afuera o Escape. */
export const Popover = ({
  anchor,
  onClose,
  children,
  width,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    const w = ref.current.offsetWidth;
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    const left = Math.min(r.left, window.innerWidth - w - 8);
    setPos({ top, left: Math.max(8, left) });
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} className="popover" style={{ ...pos, width }}>
      {children}
    </div>,
    document.body,
  );
};

export type MenuItem =
  | { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }
  | "sep";

export const Menu = ({
  anchor,
  items,
  onClose,
}: {
  anchor: HTMLElement | null;
  items: MenuItem[];
  onClose: () => void;
}) => (
  <Popover anchor={anchor} onClose={onClose}>
    <div className="menu">
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            className={`menu-item${it.danger ? " danger" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            <span className="menu-icon">{it.icon}</span>
            {it.label}
          </button>
        ),
      )}
    </div>
  </Popover>
);

/** Hook pequeño para abrir un popover/menú desde un botón. */
export const useAnchor = () => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      setAnchor(e.currentTarget);
    },
    close: () => setAnchor(null),
  };
};
