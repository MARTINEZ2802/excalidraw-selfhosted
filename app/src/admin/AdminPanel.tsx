import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Trash } from "lucide-react";

import { Ico } from "../ui/icons";

import { useSession } from "../auth/AuthGate";
import { errMsg, supabase } from "../lib/supabase";
import type { Profile } from "../lib/supabase";

const callAdmin = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
};

/** Administración de usuarios (solo admins). El acceso a proyectos se da en cada proyecto. */
const AdminPanel = () => {
  const { me, reloadUsers } = useSession();
  const [users, setUsers] = useState<Profile[]>([]);
  const [msg, setMsg] = useState("");
  const [nu, setNu] = useState({ username: "", display_name: "", password: "", role: "user" });

  const load = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id,username,display_name,role").order("username");
    setUsers((data as Profile[]) || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setMsg("");
    try {
      await fn();
      await load();
      await reloadUsers();
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  return (
    <div className="page-wrap">
      <h1 className="page-title">Administración</h1>
      <p className="muted">
        Crea usuarios aquí. Para darles acceso a un proyecto, agrégalos como participantes desde el inicio del
        proyecto. Los administradores ven todos los proyectos.
      </p>
      {msg && <div className="error">{msg}</div>}

      <h2 className="section-title">Usuarios</h2>
      <div className="list">
        {users.map((u) => (
          <div key={u.id} className="list-row">
            <span>
              <b>{u.display_name || u.username}</b> <span className="muted small">@{u.username}</span>{" "}
              <span className="pill">{u.role === "admin" ? "Administrador" : "Usuario"}</span>
            </span>
            {u.id !== me.id && (
              <span className="row gap-sm">
                <button
                  className="btn sm"
                  onClick={() =>
                    run(async () => {
                      const name = window.prompt("Nombre para mostrar", u.display_name ?? "");
                      if (name !== null) {
                        const { error } = await supabase
                          .from("profiles")
                          .update({ display_name: name.trim() || null })
                          .eq("id", u.id);
                        if (error) throw error;
                      }
                    })
                  }
                >
                  <Ico icon={Pencil} size={14} /> Nombre
                </button>
                <button
                  className="btn sm"
                  onClick={() =>
                    run(async () => {
                      const password = window.prompt("Nueva contraseña (mín. 8)");
                      if (password) await callAdmin({ action: "set_password", id: u.id, password });
                    })
                  }
                >
                  <Ico icon={KeyRound} size={14} /> Contraseña
                </button>
                <button
                  className="btn sm danger"
                  onClick={() =>
                    run(async () => {
                      if (window.confirm(`¿Eliminar usuario ${u.username}?`))
                        await callAdmin({ action: "delete", id: u.id });
                    })
                  }
                >
                  <Ico icon={Trash} size={14} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>

      <h2 className="section-title">Crear usuario</h2>
      <form
        className="form"
        style={{ maxWidth: 420 }}
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await callAdmin({ action: "create", ...nu, display_name: nu.display_name || null });
            setNu({ username: "", display_name: "", password: "", role: "user" });
          });
        }}
      >
        <input placeholder="usuario (a-z 0-9 . _ -)" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
        <input placeholder="nombre para mostrar (opcional)" value={nu.display_name} onChange={(e) => setNu({ ...nu, display_name: e.target.value })} />
        <input placeholder="contraseña (mín. 8)" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
        <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
          <option value="user">Usuario</option>
          <option value="admin">Administrador</option>
        </select>
        <button className="btn primary" disabled={!nu.username || nu.password.length < 8}>
          Crear
        </button>
      </form>
    </div>
  );
};

export default AdminPanel;
