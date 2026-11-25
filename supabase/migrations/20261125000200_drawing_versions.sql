-- Protección de pizarras:
-- 1) Bloquea guardar una escena vacía encima de una pizarra con contenido
--    (un bug del cliente vaciaba los dibujos al salir de la página).
-- 2) Historial: guarda la versión anterior de la escena como máximo cada 10 min
--    por pizarra (se conservan las 50 más recientes).

create table if not exists public.drawing_versions (
  id bigserial primary key,
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  scene jsonb not null,
  saved_by uuid,
  saved_at timestamptz not null default now()
);
create index if not exists drawing_versions_drawing_idx on public.drawing_versions (drawing_id, saved_at desc);

alter table public.drawing_versions enable row level security;
drop policy if exists drawing_versions_read on public.drawing_versions;
create policy drawing_versions_read on public.drawing_versions for select to authenticated
  using (exists (
    select 1 from public.drawings d
    where d.id = drawing_id
      and (public.can_access_folder(d.folder_id) or public.can_read_project(d.project_id))
  ));
-- Sin políticas de escritura: solo el trigger (security definer) inserta.

create or replace function public.drawings_guard_and_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_n int := jsonb_array_length(coalesce(old.scene -> 'elements', '[]'::jsonb));
  new_n int := jsonb_array_length(coalesce(new.scene -> 'elements', '[]'::jsonb));
begin
  if new.scene is not distinct from old.scene then
    return new;
  end if;
  if old_n > 0 and new_n = 0 then
    raise exception 'Guardado bloqueado: se intentó vaciar la pizarra "%"', old.name
      using errcode = 'P0001';
  end if;
  if old_n > 0 and not exists (
    select 1 from public.drawing_versions v
    where v.drawing_id = old.id and v.saved_at > now() - interval '10 minutes'
  ) then
    insert into public.drawing_versions (drawing_id, scene, saved_by)
    values (old.id, old.scene, old.updated_by);
    delete from public.drawing_versions
    where drawing_id = old.id
      and id not in (
        select id from public.drawing_versions
        where drawing_id = old.id order by saved_at desc limit 50
      );
  end if;
  return new;
end;
$$;

revoke execute on function public.drawings_guard_and_version() from public, anon, authenticated;

drop trigger if exists drawings_guard_and_version on public.drawings;
create trigger drawings_guard_and_version
  before update of scene on public.drawings
  for each row execute function public.drawings_guard_and_version();
