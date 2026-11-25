import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { supabase, toEmail } from "../lib/supabase";
import type { Profile, UserLite } from "../lib/supabase";

type Session = {
  me: Profile;
  users: UserLite[];
  userById: Map<string, UserLite>;
  reloadUsers: () => Promise<void>;
};
const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx)!;

export const userLabel = (u?: UserLite) => (u ? u.display_name || u.username : "¿?");

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: toEmail(username),
      password,
    });
    if (error) setError("Usuario o contraseña incorrectos");
    setBusy(false);
  };

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <h2>Proyectos</h2>
        <p className="muted login-sub">Inicia sesión para continuar.</p>
        <input
          placeholder="Usuario"
          value={username}
          autoFocus
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          placeholder="Contraseña"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy || !username || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
};

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [users, setUsers] = useState<UserLite[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUid(data.session?.user.id ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) =>
      setUid(session?.user.id ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  const reloadUsers = useCallback(async () => {
    const { data } = await supabase.rpc("list_users");
    setUsers((data as UserLite[]) ?? []);
  }, []);

  useEffect(() => {
    if (!uid) {
      setMe(null);
      return;
    }
    supabase
      .from("profiles")
      .select("id,username,display_name,role")
      .eq("id", uid)
      .single()
      .then(({ data }) => setMe(data as Profile));
    reloadUsers();
  }, [uid, reloadUsers]);

  if (!ready) return null;
  if (!uid) return <Login />;
  if (!me) return <div className="center muted">Cargando…</div>;

  const userById = new Map(users.map((u) => [u.id, u]));
  return (
    <SessionCtx.Provider value={{ me, users, userById, reloadUsers }}>
      {children}
    </SessionCtx.Provider>
  );
};
