-- Funciones de trigger: nadie las llama por RPC (los triggers siguen funcionando)
revoke execute on function public.projects_add_owner() from public, anon, authenticated;
revoke execute on function public.drawings_legacy_page() from public, anon, authenticated;
revoke execute on function public.pages_validate() from public, anon, authenticated;
revoke execute on function public.pages_drop_drawing() from public, anon, authenticated;
revoke execute on function public.task_db_seed() from public, anon, authenticated;
revoke execute on function public.db_child_project() from public, anon, authenticated;
-- Helpers de permisos: solo usuarios autenticados (las políticas RLS los usan)
revoke execute on function public.project_role(uuid) from public, anon;
revoke execute on function public.can_read_project(uuid) from public, anon;
revoke execute on function public.can_edit_project(uuid) from public, anon;
revoke execute on function public.can_manage_project(uuid) from public, anon;
grant execute on function public.project_role(uuid) to authenticated;
grant execute on function public.can_read_project(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
