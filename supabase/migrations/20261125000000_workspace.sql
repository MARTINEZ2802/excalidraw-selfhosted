-- Espacio de trabajo tipo Notion: proyectos, miembros, árbol de páginas,
-- bases de tareas (propiedades + vistas). Migración ADITIVA: la app vieja
-- (folders / folder_access) sigue funcionando hasta el corte.

-- ============ Tablas ============

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  icon text,
  description text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

alter table public.drawings
  add column project_id uuid references public.projects(id) on delete cascade,
  alter column folder_id drop not null;
create index drawings_project_idx on public.drawings (project_id);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.pages(id) on delete cascade,
  kind text not null check (kind in ('task_db', 'task', 'canvas', 'doc', 'link')),
  title text not null default '',
  icon text,
  position double precision not null default 0,
  content jsonb,                       -- bloques BlockNote (doc / task)
  url text,                            -- link
  link_kind text check (link_kind in ('gsheet', 'gdoc', 'gslides', 'other')),
  drawing_id uuid unique references public.drawings(id) on delete set null, -- canvas
  -- tareas
  db_id uuid references public.pages(id) on delete cascade,
  status text,
  assignees uuid[] not null default '{}',
  start_date date,
  due_date date,
  progress smallint not null default 0 check (progress between 0 and 100),
  props jsonb not null default '{}',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or due_date is null or start_date <= due_date)
);
create index pages_project_idx on public.pages (project_id);
create index pages_parent_idx on public.pages (parent_id);
create index pages_db_idx on public.pages (db_id);

create table public.db_properties (
  id uuid primary key default gen_random_uuid(),
  db_id uuid not null references public.pages(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in
    ('status', 'text', 'number', 'select', 'multi_select', 'date', 'person', 'checkbox', 'url')),
  options jsonb not null default '[]',  -- [{id,name,color,done?}]
  position double precision not null default 0,
  system boolean not null default false
);
create index db_properties_db_idx on public.db_properties (db_id);

create table public.db_views (
  id uuid primary key default gen_random_uuid(),
  db_id uuid not null references public.pages(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  type text not null check (type in ('list', 'kanban', 'gantt', 'calendar')),
  config jsonb not null default '{}',
  position double precision not null default 0
);
create index db_views_db_idx on public.db_views (db_id);

-- ============ Permisos ============

create function public.project_role(pid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then 'owner'
    else (select role from public.project_members
          where project_id = pid and user_id = auth.uid()) end;
$$;
create function public.can_read_project(pid uuid) returns boolean
language sql stable set search_path = '' as $$
  select public.project_role(pid) is not null;
$$;
create function public.can_edit_project(pid uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.project_role(pid) in ('owner', 'editor'), false);
$$;
create function public.can_manage_project(pid uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.project_role(pid) = 'owner', false);
$$;

-- Directorio mínimo de usuarios (profiles_select solo deja ver el propio)
create function public.list_users()
returns table (id uuid, username text, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name from public.profiles p
  where auth.uid() is not null order by p.username;
$$;
revoke execute on function public.list_users() from anon, public;
grant execute on function public.list_users() to authenticated;

-- ============ Triggers ============

-- El creador del proyecto queda como owner
create function public.projects_add_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.created_by, 'owner') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger projects_add_owner after insert on public.projects
  for each row execute function public.projects_add_owner();

-- Reglas del árbol: mismo proyecto, sin ciclos, tareas dentro de una base
create function public.pages_validate() returns trigger
language plpgsql set search_path = '' as $$
declare
  par public.pages;
begin
  if tg_op = 'UPDATE' then
    if new.kind <> old.kind then raise exception 'No se puede cambiar el tipo de página'; end if;
    if new.project_id <> old.project_id then raise exception 'No se puede mover entre proyectos'; end if;
  end if;

  if new.parent_id is not null then
    select * into par from public.pages where id = new.parent_id;
    if par.id is null then raise exception 'Página padre no encontrada'; end if;
    if par.project_id <> new.project_id then raise exception 'El padre es de otro proyecto'; end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id and exists (
      with recursive up as (
        select id, parent_id from public.pages where id = new.parent_id
        union all
        select p.id, p.parent_id from public.pages p join up on p.id = up.parent_id
      ) select 1 from up where id = new.id
    ) then
      raise exception 'Movimiento inválido: crearía un ciclo';
    end if;
  end if;

  if new.kind = 'task' then
    if par.id is null or par.kind not in ('task_db', 'task') then
      raise exception 'Una tarea debe estar dentro de una base de tareas o de otra tarea';
    end if;
    new.db_id := case when par.kind = 'task_db' then par.id else par.db_id end;
    if tg_op = 'UPDATE' and new.db_id <> old.db_id then
      raise exception 'No se puede mover una tarea a otra base de tareas';
    end if;
  else
    new.db_id := null;
  end if;

  if new.kind = 'canvas' and new.drawing_id is null then
    insert into public.drawings (folder_id, project_id, name)
    values (null, new.project_id, coalesce(nullif(new.title, ''), 'Pizarra'))
    returning id into new.drawing_id;
  end if;
  return new;
end $$;
create trigger pages_validate before insert or update on public.pages
  for each row execute function public.pages_validate();

create trigger pages_touch before update on public.pages
  for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- Al borrar una pizarra se borra su dibujo (los archivos de storage los borra el cliente)
create function public.pages_drop_drawing() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.drawing_id is not null then
    delete from public.drawings where id = old.drawing_id;
  end if;
  return old;
end $$;
create trigger pages_drop_drawing after delete on public.pages
  for each row execute function public.pages_drop_drawing();

-- Nueva base de tareas: propiedades y vistas por defecto
create function public.task_db_seed() returns trigger
language plpgsql set search_path = '' as $$
declare
  st uuid;
begin
  if new.kind <> 'task_db' then return new; end if;
  insert into public.db_properties (db_id, project_id, name, type, options, position, system)
  values (new.id, new.project_id, 'Estado', 'status', '[
      {"id":"todo","name":"Pendiente","color":"gray","done":false},
      {"id":"doing","name":"En progreso","color":"blue","done":false},
      {"id":"done","name":"Hecho","color":"green","done":true}]', 0, true)
  returning id into st;
  insert into public.db_properties (db_id, project_id, name, type, options, position)
  values (new.id, new.project_id, 'Prioridad', 'select', '[
      {"id":"high","name":"Alta","color":"red"},
      {"id":"med","name":"Media","color":"yellow"},
      {"id":"low","name":"Baja","color":"gray"}]', 1);
  insert into public.db_views (db_id, project_id, name, type, config, position) values
    (new.id, new.project_id, 'Lista', 'list', '{}', 0),
    (new.id, new.project_id, 'Tablero', 'kanban', jsonb_build_object('group_by', 'status'), 1),
    (new.id, new.project_id, 'Cronograma', 'gantt', '{"scale":"week"}', 2),
    (new.id, new.project_id, 'Calendario', 'calendar', '{}', 3);
  return new;
end $$;
create trigger task_db_seed after insert on public.pages
  for each row execute function public.task_db_seed();

-- project_id de propiedades/vistas siempre derivado de su base
create function public.db_child_project() returns trigger
language plpgsql set search_path = '' as $$
begin
  select project_id into new.project_id from public.pages
  where id = new.db_id and kind = 'task_db';
  if new.project_id is null then raise exception 'Base de tareas no encontrada'; end if;
  return new;
end $$;
create trigger db_properties_project before insert or update on public.db_properties
  for each row execute function public.db_child_project();
create trigger db_views_project before insert or update on public.db_views
  for each row execute function public.db_child_project();

-- Compatibilidad: un dibujo creado por la app vieja aparece como pizarra en el proyecto
create function public.drawings_legacy_page() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.folder_id is not null and new.project_id is null
     and exists (select 1 from public.projects where id = new.folder_id) then
    update public.drawings set project_id = new.folder_id where id = new.id;
    insert into public.pages (project_id, kind, title, drawing_id, position, created_by)
    values (new.folder_id, 'canvas', new.name, new.id,
            extract(epoch from now()), new.updated_by);
  end if;
  return new;
end $$;
create trigger drawings_legacy_page after insert on public.drawings
  for each row execute function public.drawings_legacy_page();

-- ============ RLS ============

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.pages enable row level security;
alter table public.db_properties enable row level security;
alter table public.db_views enable row level security;

create policy projects_select on public.projects for select to authenticated
  using (public.can_read_project(id) or created_by = (select auth.uid()));
create policy projects_insert on public.projects for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id)) with check (public.can_manage_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.can_manage_project(id));

create policy members_select on public.project_members for select to authenticated
  using (public.can_read_project(project_id));
create policy members_write on public.project_members for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

create policy pages_select on public.pages for select to authenticated
  using (public.can_read_project(project_id));
create policy pages_write on public.pages for all to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy db_properties_select on public.db_properties for select to authenticated
  using (public.can_read_project(project_id));
create policy db_properties_write on public.db_properties for all to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy db_views_select on public.db_views for select to authenticated
  using (public.can_read_project(project_id));
create policy db_views_write on public.db_views for all to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

-- drawings: carpeta (app vieja) o proyecto (app nueva)
drop policy drawings_select on public.drawings;
drop policy drawings_insert on public.drawings;
drop policy drawings_update on public.drawings;
drop policy drawings_delete on public.drawings;
create policy drawings_select on public.drawings for select to authenticated
  using (public.can_access_folder(folder_id) or public.can_read_project(project_id));
create policy drawings_insert on public.drawings for insert to authenticated
  with check (public.can_access_folder(folder_id) or public.can_edit_project(project_id));
create policy drawings_update on public.drawings for update to authenticated
  using (public.can_access_folder(folder_id) or public.can_edit_project(project_id))
  with check (public.can_access_folder(folder_id) or public.can_edit_project(project_id));
create policy drawings_delete on public.drawings for delete to authenticated
  using (public.can_access_folder(folder_id) or public.can_edit_project(project_id));

drop policy files_rw on storage.objects;
create policy files_read on storage.objects for select to authenticated
  using (bucket_id = 'drawing-files' and exists (
    select 1 from public.drawings d
    where d.id::text = (storage.foldername(objects.name))[1]
      and (public.can_access_folder(d.folder_id) or public.can_read_project(d.project_id))));
create policy files_write on storage.objects for all to authenticated
  using (bucket_id = 'drawing-files' and exists (
    select 1 from public.drawings d
    where d.id::text = (storage.foldername(objects.name))[1]
      and (public.can_access_folder(d.folder_id) or public.can_edit_project(d.project_id))))
  with check (bucket_id = 'drawing-files' and exists (
    select 1 from public.drawings d
    where d.id::text = (storage.foldername(objects.name))[1]
      and (public.can_access_folder(d.folder_id) or public.can_edit_project(d.project_id))));

-- ============ Migración de datos: carpetas -> proyectos ============

insert into public.projects (id, name, created_by, created_at)
select id, name, created_by, created_at from public.folders;   -- trigger: creador = owner

insert into public.project_members (project_id, user_id, role)
select f.id, p.id, 'editor'
from public.folders f join public.profiles p on f.name = any (p.folder_access)
on conflict do nothing;

update public.drawings set project_id = folder_id where folder_id is not null;

insert into public.pages (project_id, kind, title, icon, position)
select id, 'task_db', 'Tareas', '📋', 0 from public.projects;  -- trigger: propiedades + vistas

insert into public.pages (project_id, kind, title, drawing_id, position, created_by, created_at)
select folder_id, 'canvas', name, id,
       row_number() over (partition by folder_id order by name),
       updated_by, created_at
from public.drawings where folder_id is not null;

-- ============ Realtime ============
alter publication supabase_realtime add table public.pages;
