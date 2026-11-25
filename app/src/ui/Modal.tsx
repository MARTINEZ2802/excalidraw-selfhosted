import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Ico } from "./icons";

export const Modal = ({
  title,
  onClose,
  children,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) => {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn round" onClick={onClose} aria-label="Cerrar">
            <Ico icon={X} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
};

/** Diálogo de texto (reemplaza window.prompt). */
export const PromptModal = ({
  title,
  label,
  initial = "",
  placeholder,
  okLabel = "Aceptar",
  onSubmit,
  onClose,
  extra,
  allowEmpty,
}: {
  allowEmpty?: boolean;
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  okLabel?: string;
  onSubmit: (v: string) => void;
  onClose: () => void;
  extra?: ReactNode;
}) => {
  const [v, setV] = useState(initial);
  return (
    <Modal title={title} onClose={onClose} width={420}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim() || allowEmpty) {
            onSubmit(v.trim());
            onClose();
          }
        }}
      >
        {label && <label>{label}</label>}
        <input autoFocus value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />
        {extra}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!v.trim() && !allowEmpty}>
            {okLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};
