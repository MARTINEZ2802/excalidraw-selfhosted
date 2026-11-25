import { useState } from "react";
import { Eye, EyeOff, Plus, Trash, X } from "lucide-react";

import { Ico } from "../ui/icons";

import { useProject } from "../lib/projectStore";
import type { DbProperty, DbView, PropOption, PropType } from "../lib/supabase";
import { Modal } from "../ui/Modal";
import { COLORS, COLOR_NAMES, Chip, newOptionId } from "./cells";

const TYPE_LABEL: Record<Exclude<PropType, "status">, string> = {
  text: "Texto",
  number: "Número",
  select: "Selección",
  multi_select: "Selección múltiple",
  date: "Fecha",
  person: "Persona",
  checkbox: "Casilla",
  url: "URL",
};
const hasOptions = (t: PropType) => t === "select" || t === "multi_select" || t === "status";

const OptionsEditor = ({ prop, onSave }: { prop: DbProperty; onSave: (o: PropOption[]) => void }) => {
  const [opts, setOpts] = useState(prop.options);
  const dirty = JSON.stringify(opts) !== JSON.stringify(prop.options);
  const set = (i: number, patch: Partial<PropOption>) =>
    setOpts((l) => l.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="opts">
      {opts.map((o, i) => (
        <div key={o.id} className="row gap-sm">
          <Chip opt={o} />
          <input value={o.name} onChange={(e) => set(i, { name: e.target.value })} />
          <select value={o.color} onChange={(e) => set(i, { color: e.target.value })}>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {COLOR_NAMES[c]}
              </option>
            ))}
          </select>
          {prop.type === "status" && (
            <label className="small row gap-sm" title="Las tareas con este estado cuentan como 100%">
              <input type="checkbox" checked={!!o.done} onChange={(e) => set(i, { done: e.target.checked })} />
              Hecho
            </label>
          )}
          <button
            className="icon-btn sm"
            title="Subir"
            disabled={i === 0}
            onClick={() => setOpts((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}
          >
            ↑
          </button>
          <button
            className="icon-btn sm"
            title="Quitar opción"
            disabled={prop.type === "status" && opts.length <= 2}
            onClick={() => setOpts((l) => l.filter((_, j) => j !== i))}
          >
            <Ico icon={X} size={14} />
          </button>
        </div>
      ))}
      <div className="row gap-sm">
        <button
          className="btn sm"
          onClick={() =>
            setOpts((l) => [...l, { id: newOptionId(), name: `Opción ${l.length + 1}`, color: COLORS[l.length % COLORS.length] }])
          }
        >
          <Ico icon={Plus} size={14} /> Opción
        </button>
        {dirty && (
          <button
            className="btn sm primary"
            disabled={opts.some((o) => !o.name.trim()) || (prop.type === "status" && !opts.some((o) => o.done))}
            onClick={() => onSave(opts.map((o) => ({ ...o, name: o.name.trim() })))}
          >
            Guardar opciones
          </button>
        )}
      </div>
      {prop.type === "status" && !opts.some((o) => o.done) && (
        <div className="error small">Al menos un estado debe marcarse como “Hecho”.</div>
      )}
    </div>
  );
};

export const PropertyManager = ({
  dbId,
  view,
  onClose,
}: {
  dbId: string;
  view: DbView;
  onClose: () => void;
}) => {
  const { properties, saveProperty, deleteProperty, saveView, canEdit } = useProject();
  const props = properties(dbId);
  const [name, setName] = useState("");
  const [type, setType] = useState<Exclude<PropType, "status">>("select");
  const hidden = new Set(view.config.hidden ?? []);

  const toggleHidden = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveView({ id: view.id, db_id: dbId, config: { ...view.config, hidden: [...next] } });
  };

  return (
    <Modal title="Propiedades de las tareas" onClose={onClose} width={640}>
      <p className="muted small">
        Estado, Responsables, Inicio, Fin y Avance son fijos. Agrega las columnas que necesites; el ojo
        controla si se ven en la vista “{view.name}”.
      </p>
      <div className="props-list">
        {props.map((p) => (
          <div key={p.id} className="prop-item">
            <div className="row gap-sm">
              {p.type !== "status" && (
                <button
                  className="icon-btn sm"
                  title={hidden.has(p.id) ? "Mostrar en esta vista" : "Ocultar en esta vista"}
                  onClick={() => toggleHidden(p.id)}
                >
                  <Ico icon={hidden.has(p.id) ? EyeOff : Eye} size={14} />
                </button>
              )}
              <input
                className="grow"
                defaultValue={p.name}
                disabled={!canEdit}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== p.name) saveProperty({ id: p.id, db_id: dbId, name: v });
                }}
              />
              {p.type === "status" ? (
                <span className="pill">Estado</span>
              ) : (
                <select
                  value={p.type}
                  disabled={!canEdit}
                  onChange={(e) => saveProperty({ id: p.id, db_id: dbId, type: e.target.value as PropType })}
                >
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
              {!p.system && canEdit && (
                <button
                  className="icon-btn sm"
                  title="Eliminar propiedad"
                  onClick={() => window.confirm(`¿Eliminar la propiedad "${p.name}"?`) && deleteProperty(p.id)}
                >
                  <Ico icon={Trash} size={14} />
                </button>
              )}
            </div>
            {hasOptions(p.type) && canEdit && (
              <OptionsEditor
                key={JSON.stringify(p.options)}
                prop={p}
                onSave={(options) => saveProperty({ id: p.id, db_id: dbId, options })}
              />
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form
          className="row gap-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            saveProperty({
              db_id: dbId,
              name: name.trim(),
              type,
              options: hasOptions(type)
                ? [
                    { id: newOptionId(), name: "Opción 1", color: "blue" },
                    { id: newOptionId(), name: "Opción 2", color: "green" },
                  ]
                : [],
              position: Math.max(0, ...props.map((p) => p.position)) + 1,
            });
            setName("");
          }}
        >
          <input className="grow" placeholder="Nueva propiedad…" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value as any)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!name.trim()}>
            Agregar
          </button>
        </form>
      )}
    </Modal>
  );
};
