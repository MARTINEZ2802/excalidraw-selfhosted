import { useCallback, useEffect, useState } from "react";

import { supabase } from "./supabase";
import type { Folder, Profile } from "./supabase";

const callAdmin = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
  });
  if (error) {
    throw new Error(error.message);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
};

export const AdminPanel = ({
  folders,
  me,
  onFoldersChanged,
}: {
  folders: Folder[];
  me: Profile;
  onFoldersChanged: () => void;
}) => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [msg, setMsg] = useState("");
  const [nu, setNu] = useState({ username: "", password: "", role: "user" });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("username");
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
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const check = ({ error }: { error: any }) => {
    if (error) {
      throw error;
    }
  };

  const toggle = (u: Profile, name: string) =>
    run(async () => {
      const next = u.folder_access.includes(name)
        ? u.folder_access.filter((n) => n !== name)
        : [...u.folder_access, name];
      check(
        await supabase
          .from("profiles")
          .update({ folder_access: next })
          .eq("id", u.id),
      );
    });

  return (
    <div>
      <h4>Carpetas</h4>
      <button
        onClick={() =>
          run(async () => {
            const name = prompt("Nombre de la carpeta")?.trim();
            if (name) {
              check(
                await supabase
                  .from("folders")
                  .insert({ name, created_by: me.id }),
              );
              onFoldersChanged();
            }
          })
        }
      >
        + Nueva carpeta
      </button>
      {folders.map((f) => (
        <div key={f.id} style={{ marginTop: 4 }}>
          📁 {f.name}{" "}
          <button
            onClick={() =>
              run(async () => {
                const name = prompt("Nuevo nombre", f.name)?.trim();
                if (name && name !== f.name) {
                  check(
                    await supabase
                      .from("folders")
                      .update({ name })
                      .eq("id", f.id),
                  );
                  onFoldersChanged();
                }
              })
            }
          >
            ✎
          </button>
          <button
            onClick={() =>
              run(async () => {
                if (confirm(`¿Eliminar "${f.name}" y todos sus dibujos?`)) {
                  check(
                    await supabase.from("folders").delete().eq("id", f.id),
                  );
                  onFoldersChanged();
                }
              })
            }
          >
            🗑
          </button>
        </div>
      ))}

      <h4>Usuarios</h4>
      {msg && <div style={{ color: "#c92a2a" }}>{msg}</div>}
      {users.map((u) => (
        <div
          key={u.id}
          style={{ borderTop: "1px solid #ddd", padding: "6px 0" }}
        >
          <b>{u.username}</b> · {u.role}{" "}
          {u.id !== me.id && (
            <>
              <button
                title="Cambiar contraseña"
                onClick={() =>
                  run(async () => {
                    const password = prompt("Nueva contraseña (mín. 8)");
                    if (password) {
                      await callAdmin({
                        action: "set_password",
                        id: u.id,
                        password,
                      });
                    }
                  })
                }
              >
                🔑
              </button>
              <button
                title="Eliminar usuario"
                onClick={() =>
                  run(async () => {
                    if (confirm(`¿Eliminar usuario ${u.username}?`)) {
                      await callAdmin({ action: "delete", id: u.id });
                    }
                  })
                }
              >
                🗑
              </button>
            </>
          )}
          {u.role === "admin" ? (
            <div style={{ opacity: 0.6 }}>Acceso a todas las carpetas</div>
          ) : (
            <div>
              {folders.map((f) => (
                <label key={f.id} style={{ marginRight: 10 }}>
                  <input
                    type="checkbox"
                    checked={u.folder_access.includes(f.name)}
                    onChange={() => toggle(u, f.name)}
                  />{" "}
                  {f.name}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <h4>Crear usuario</h4>
      <input
        placeholder="usuario"
        value={nu.username}
        onChange={(e) => setNu({ ...nu, username: e.target.value })}
      />
      <input
        placeholder="contraseña (mín. 8)"
        type="password"
        value={nu.password}
        onChange={(e) => setNu({ ...nu, password: e.target.value })}
      />
      <select
        value={nu.role}
        onChange={(e) => setNu({ ...nu, role: e.target.value })}
      >
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      <button
        onClick={() =>
          run(async () => {
            await callAdmin({ action: "create", ...nu });
            setNu({ username: "", password: "", role: "user" });
          })
        }
      >
        Crear
      </button>
    </div>
  );
};
