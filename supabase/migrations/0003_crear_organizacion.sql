-- 0003 · Crear organización por RPC (security definer): el INSERT directo con RETURNING choca con la política de SELECT
-- porque el trigger que vuelve admin al creador corre después del RETURNING.
drop trigger if exists org_creador_admin on organizaciones;
drop function if exists privado.creador_admin();
drop policy if exists org_ins on organizaciones;

create or replace function public.crear_organizacion(p_nombre text, p_tipo tipo_organizacion default 'finca')
returns organizaciones
language plpgsql security definer set search_path = public as $$
declare o organizaciones;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  if length(trim(p_nombre)) < 2 then raise exception 'nombre demasiado corto'; end if;
  insert into organizaciones (nombre, tipo) values (trim(p_nombre), p_tipo) returning * into o;
  insert into miembros (organizacion_id, user_id, rol) values (o.id, auth.uid(), 'admin');
  return o;
end $$;
revoke all on function public.crear_organizacion(text, tipo_organizacion) from public, anon;
grant execute on function public.crear_organizacion(text, tipo_organizacion) to authenticated;
