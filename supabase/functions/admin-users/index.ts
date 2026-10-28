// Edge Function: gestión de usuarios (requiere service role, solo admins)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "No autenticado" }, 401);
  const { data: me } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") return json({ error: "Solo administradores" }, 403);

  const b = await req.json();

  if (b.action === "create") {
    const username = String(b.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return json({ error: "Usuario inválido (3-32: a-z 0-9 . _ -)" }, 400);
    }
    if (String(b.password ?? "").length < 8) {
      return json({ error: "Contraseña mínima de 8 caracteres" }, 400);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: `${username}@excalidraw.local`,
      password: b.password,
      email_confirm: true,
    });
    if (error) return json({ error: error.message }, 400);
    const { error: pe } = await admin.from("profiles").insert({
      id: data.user.id,
      username,
      display_name: b.display_name ?? null,
      role: b.role === "admin" ? "admin" : "user",
      folder_access: Array.isArray(b.folder_access) ? b.folder_access : [],
    });
    if (pe) {
      await admin.auth.admin.deleteUser(data.user.id);
      return json({ error: pe.message }, 400);
    }
    return json({ ok: true });
  }

  if (b.action === "set_password") {
    if (String(b.password ?? "").length < 8) {
      return json({ error: "Contraseña mínima de 8 caracteres" }, 400);
    }
    const { error } = await admin.auth.admin.updateUserById(b.id, {
      password: b.password,
    });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (b.action === "delete") {
    if (b.id === user.id) {
      return json({ error: "No puedes eliminarte a ti mismo" }, 400);
    }
    const { error } = await admin.auth.admin.deleteUser(b.id);
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  return json({ error: "Acción desconocida" }, 400);
});
