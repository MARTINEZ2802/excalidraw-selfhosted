import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

type Toast = { id: number; text: string; kind: "error" | "info" };
const Ctx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(Ctx);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "error") => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, text, kind }]);
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
};
