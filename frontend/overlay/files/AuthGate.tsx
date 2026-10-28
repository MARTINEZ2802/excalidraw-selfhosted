import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { supabase, toEmail } from "./supabase";

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(!!session),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return null;
  }
  if (signedIn) {
    return <>{children}</>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: toEmail(username),
      password,
    });
    if (error) {
      setError("Usuario o contraseña incorrectos");
    }
    setBusy(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f1f3f5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 12,
          width: 320,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,.12)",
        }}
      >
        <h2 style={{ margin: 0 }}>Excalidraw</h2>
        <input
          placeholder="Usuario"
          value={username}
          autoFocus
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="Contraseña"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />
        {error && <div style={{ color: "#c92a2a" }}>{error}</div>}
        <button disabled={busy || !username || !password} style={{ padding: 10 }}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
};
