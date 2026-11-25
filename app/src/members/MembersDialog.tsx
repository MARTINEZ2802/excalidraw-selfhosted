import { useState } from "react";
import { X } from "lucide-react";

import { Ico } from "../ui/icons";

import { useSession, userLabel } from "../auth/AuthGate";
import { useProject } from "../lib/projectStore";
import { errMsg, supabase } from "../lib/supabase";
import type { Role } from "../lib/supabase";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/toast";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Propietario",
  editor: "Editor",
  viewer: "Lector",
};

export const MembersDialog = ({ onClose }: { onClose: () => void }) => {
  const { project, members, canManage, reloadMembers } = useProject();
  const { users, userById, me } = useSession();
  const toast = useToast();
  const [pick, setPick] = useState("");
  const [role, setRole] = useState<Role>("editor");

  const run = async (q: PromiseLike<{ error: unknown }>) => {
    const { error } = await q;
    if (error) toast(errMsg(error));
    await reloadMembers();
  };
  const owners = members.filter((m) => m.role === "owner").length;
  const candidates = users.filter((u) => !members.some((m) => m.user_id === u.id));

  return (
    <Modal title={`Participantes · ${project.name}`} onClose={onClose} width={520}>
      <p className="muted small">
        <b>Propietario</b>: todo, incluidos participantes. <b>Editor</b>: crea y edita páginas, tareas y
        pizarras. <b>Lector</b>: solo ve.
      </p>
      <div className="list">
        {members.map((m) => {
          const u = userById.get(m.user_id);
          const lastOwner = m.role === "owner" && owners <= 1;
          return (
            <div key={m.user_id} className="list-row">
              <span className="row gap-sm">
                <span className="avatar sm">{userLabel(u).slice(0, 1).toUpperCase()}</span>
                {userLabel(u)}
                {u && <span className="muted small">@{u.username}</span>}
                {m.user_id === me.id && <span className="muted small">(tú)</span>}
              </span>
              {canManage ? (
                <span className="row gap-sm">
                  <select
                    value={m.role}
                    disabled={lastOwner}
                    title={lastOwner ? "Debe quedar al menos un propietario" : undefined}
                    onChange={(e) =>
                      run(
                        supabase
                          .from("project_members")
                          .update({ role: e.target.value })
                          .eq("project_id", project.id)
                          .eq("user_id", m.user_id),
                      )
                    }
                  >
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-btn sm"
                    title="Quitar del proyecto"
                    disabled={lastOwner}
                    onClick={() =>
                      window.confirm(`¿Quitar a ${userLabel(u)} del proyecto?`) &&
                      run(
                        supabase
                          .from("project_members")
                          .delete()
                          .eq("project_id", project.id)
                          .eq("user_id", m.user_id),
                      )
                    }
                  >
                    <Ico icon={X} size={14} />
                  </button>
                </span>
              ) : (
                <span className="pill">{ROLE_LABEL[m.role]}</span>
              )}
            </div>
          );
        })}
      </div>
      {canManage && (
        <form
          className="row gap-sm"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pick) return;
            run(supabase.from("project_members").insert({ project_id: project.id, user_id: pick, role }));
            setPick("");
          }}
        >
          <select className="grow" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Agregar participante…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)} (@{u.username})
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!pick}>
            Agregar
          </button>
        </form>
      )}
      {canManage && candidates.length === 0 && (
        <p className="muted small">Todos los usuarios ya participan. Los administradores crean usuarios en Administración.</p>
      )}
    </Modal>
  );
};
