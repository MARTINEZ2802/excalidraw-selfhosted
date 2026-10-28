import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// Supabase Auth exige email: el login por usuario usa un dominio interno.
export const toEmail = (username: string) =>
  `${username.trim().toLowerCase()}@excalidraw.local`;

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  role: "admin" | "user";
  folder_access: string[];
};
export type Folder = { id: string; name: string };
export type Drawing = {
  id: string;
  folder_id: string;
  name: string;
  room_id: string | null;
  updated_at: string;
};
