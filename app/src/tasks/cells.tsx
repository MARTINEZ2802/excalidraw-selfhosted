import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";

import { Ico } from "../ui/icons";

import { useSession, userLabel } from "../auth/AuthGate";
import { useProject } from "../lib/projectStore";
import type { DbProperty, PropOption } from "../lib/supabase";
import { Popover, useAnchor } from "../ui/Popover";

export const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
export const COLOR_NAMES: Record<string, string> = {
  gray: "Gris", brown: "Café", orange: "Naranja", yellow: "Amarillo", green: "Verde",
  blue: "Azul", purple: "Morado", pink: "Rosa", red: "Rojo",
};

export const newOptionId = () => Math.random().toString(36).slice(2, 10);

export const Chip = ({ opt, onRemove }: { opt?: PropOption; onRemove?: () => void }) =>
  opt ? (
    <span className={`chip c-${opt.color}`}>
      {opt.name}
      {onRemove && (
        <button className="chip-x" onClick={(e) => (e.stopPropagation(), onRemove())}>
          ×
        </button>
      )}
    </span>
  ) : null;

export const ProgressBar = ({ value, compact }: { value: number; compact?: boolean }) => (
  <div className={`progress${compact ? " compact" : ""}`} title={`${value}%`}>
    <div className="progress-track">
      <div className={`progress-fill${value >= 100 ? " full" : ""}`} style={{ width: `${value}%` }} />
    </div>
    <span className="progress-num">{value}%</span>
  </div>
);

export const Avatar = ({ id }: { id: string }) => {
  const { userById } = useSession();
  const name = userLabel(userById.get(id));
  return (
    <span className="avatar sm" title={name}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
};

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("es", { day: "numeric", month: "short", year: "2-digit" });
};

type CellProps<T> = { value: T; onChange: (v: T) => void; disabled?: boolean };

// ---------- Select / Estado ----------
export const SelectCell = ({
  prop,
  value,
  onChange,
  disabled,
  multi,
}: CellProps<any> & { prop: DbProperty; multi?: boolean }) => {
  const { anchor, open, close } = useAnchor();
  const { saveProperty, canEdit } = useProject();
  const [q, setQ] = useState("");
  const selected: string[] = multi ? (Array.isArray(value) ? value : []) : value ? [value] : [];
  const opts = prop.options;
  const pick = (id: string) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else {
      onChange(selected[0] === id && prop.type !== "status" ? null : id);
      close();
    }
  };
  const createOpt = async () => {
    const name = q.trim();
    if (!name) return;
    const opt = { id: newOptionId(), name, color: COLORS[opts.length % COLORS.length] };
    await saveProperty({ id: prop.id, db_id: prop.db_id, options: [...opts, opt] });
    setQ("");
    pick(opt.id);
  };
  const filtered = opts.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className={`cell-btn${disabled ? " ro" : ""}`} onClick={disabled ? undefined : open}>
        {selected.length ? (
          selected.map((id) => <Chip key={id} opt={opts.find((o) => o.id === id)} />)
        ) : (
          <span className="placeholder">—</span>
        )}
      </div>
      {anchor && (
        <Popover anchor={anchor} onClose={close} width={240}>
          <div className="menu">
            <input
              className="menu-search"
              autoFocus
              placeholder={prop.type === "status" || !canEdit ? "Buscar…" : "Buscar o crear…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (filtered[0]) pick(filtered[0].id);
                  else if (prop.type !== "status" && canEdit) createOpt();
                }
              }}
            />
            {filtered.map((o) => (
              <button key={o.id} className="menu-item" onClick={() => pick(o.id)}>
                <span className="menu-icon">{selected.includes(o.id) && <Ico icon={Check} size={14} />}</span>
                <Chip opt={o} />
              </button>
            ))}
            {q.trim() && !filtered.length && prop.type !== "status" && canEdit && (
              <button className="menu-item" onClick={createOpt}>
                <span className="menu-icon">
                  <Ico icon={Plus} size={14} />
                </span>
                Crear «{q.trim()}»
              </button>
            )}
            {!multi && selected.length > 0 && prop.type !== "status" && (
              <button className="menu-item muted" onClick={() => (onChange(null), close())}>
                <span className="menu-icon">
                  <Ico icon={X} size={14} />
                </span>
                Quitar
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
};

// ---------- Personas ----------
export const PersonCell = ({ value, onChange, disabled }: CellProps<string[]>) => {
  const { anchor, open, close } = useAnchor();
  const { members } = useProject();
  const { userById } = useSession();
  const ids = Array.isArray(value) ? value : [];
  return (
    <>
      <div className={`cell-btn${disabled ? " ro" : ""}`} onClick={disabled ? undefined : open}>
        {ids.length ? (
          <span className="avatars">
            {ids.map((id) => (
              <Avatar key={id} id={id} />
            ))}
            {ids.length === 1 && <span className="small">{userLabel(userById.get(ids[0]))}</span>}
          </span>
        ) : (
          <span className="placeholder">—</span>
        )}
      </div>
      {anchor && (
        <Popover anchor={anchor} onClose={close} width={240}>
          <div className="menu">
            {members.map((m) => (
              <button
                key={m.user_id}
                className="menu-item"
                onClick={() =>
                  onChange(ids.includes(m.user_id) ? ids.filter((x) => x !== m.user_id) : [...ids, m.user_id])
                }
              >
                <span className="menu-icon">{ids.includes(m.user_id) && <Ico icon={Check} size={14} />}</span>
                <Avatar id={m.user_id} /> {userLabel(userById.get(m.user_id))}
              </button>
            ))}
            {members.length === 0 && <div className="muted small pad">Sin participantes</div>}
          </div>
        </Popover>
      )}
    </>
  );
};

// ---------- Fecha ----------
export const DateCell = ({ value, onChange, disabled }: CellProps<string | null>) => {
  const { anchor, open, close } = useAnchor();
  return (
    <>
      <div className={`cell-btn${disabled ? " ro" : ""}`} onClick={disabled ? undefined : open}>
        {value ? <span>{fmtDate(value)}</span> : <span className="placeholder">—</span>}
      </div>
      {anchor && (
        <Popover anchor={anchor} onClose={close} width={220}>
          <div className="menu pad">
            <input
              type="date"
              autoFocus
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value || null)}
            />
            {value && (
              <button className="menu-item muted" onClick={() => (onChange(null), close())}>
                <span className="menu-icon">
                  <Ico icon={X} size={14} />
                </span>
                Quitar fecha
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
};

// ---------- Texto / número / URL ----------
export const TextCell = ({
  value,
  onChange,
  disabled,
  type = "text",
}: CellProps<any> & { type?: "text" | "number" | "url" }) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  if (editing && !disabled)
    return (
      <input
        className="cell-input"
        autoFocus
        type={type === "number" ? "number" : "text"}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const out = type === "number" ? (v === "" ? null : Number(v)) : v.trim() || null;
          if (out !== (value ?? null)) onChange(out);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setV(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  return (
    <div className={`cell-btn${disabled ? " ro" : ""}`} onClick={() => setEditing(true)}>
      {value === null || value === undefined || value === "" ? (
        <span className="placeholder">—</span>
      ) : type === "url" ? (
        <a
          href={/^https?:/i.test(value) ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ellipsis"
        >
          {value}
        </a>
      ) : (
        <span className="ellipsis">{String(value)}</span>
      )}
    </div>
  );
};

export const CheckboxCell = ({ value, onChange, disabled }: CellProps<boolean>) => (
  <div className="cell-btn">
    <input type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
  </div>
);

// ---------- Avance ----------
export const ProgressCell = ({
  value,
  onChange,
  disabled,
  computed,
}: CellProps<number> & { computed?: boolean }) => {
  const { anchor, open, close } = useAnchor();
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const ro = disabled || computed;
  return (
    <>
      <div
        className={`cell-btn${ro ? " ro" : ""}`}
        title={computed ? "Calculado a partir de las subtareas" : undefined}
        onClick={ro ? undefined : open}
      >
        <ProgressBar value={value} compact />
      </div>
      {anchor && (
        <Popover anchor={anchor} onClose={() => (v !== value && onChange(v), close())} width={220}>
          <div className="menu pad">
            <div className="row between small">
              <span>Avance</span>
              <b>{v}%</b>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={v}
              onChange={(e) => setV(Number(e.target.value))}
              onMouseUp={() => v !== value && onChange(v)}
            />
          </div>
        </Popover>
      )}
    </>
  );
};

/** Editor genérico para una propiedad personalizada. */
export const PropCell = ({
  prop,
  value,
  onChange,
  disabled,
}: CellProps<any> & { prop: DbProperty }) => {
  switch (prop.type) {
    case "status":
    case "select":
      return <SelectCell prop={prop} value={value} onChange={onChange} disabled={disabled} />;
    case "multi_select":
      return <SelectCell prop={prop} value={value} onChange={onChange} disabled={disabled} multi />;
    case "person":
      return <PersonCell value={value} onChange={onChange} disabled={disabled} />;
    case "date":
      return <DateCell value={value} onChange={onChange} disabled={disabled} />;
    case "checkbox":
      return <CheckboxCell value={value} onChange={onChange} disabled={disabled} />;
    case "number":
      return <TextCell value={value} onChange={onChange} disabled={disabled} type="number" />;
    case "url":
      return <TextCell value={value} onChange={onChange} disabled={disabled} type="url" />;
    default:
      return <TextCell value={value} onChange={onChange} disabled={disabled} />;
  }
};
