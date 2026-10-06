-- CultiVista v2 · 0002 RLS. Función privada security definer (patrón Supabase) + políticas por operación.
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create or replace function privado.rol_en(org uuid) returns rol_miembro
language sql stable security definer set search_path = public as $$
  select m.rol from miembros m where m.organizacion_id = org and m.user_id = auth.uid() limit 1
$$;
create or replace function privado.es_miembro(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros m where m.organizacion_id = org and m.user_id = auth.uid())
$$;
create or replace function privado.puede_editar(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select privado.rol_en(org) in ('admin','tecnico')
$$;
create or replace function privado.es_admin(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select privado.rol_en(org) = 'admin'
$$;
grant usage on schema privado to authenticated;
grant execute on function privado.rol_en(uuid), privado.es_miembro(uuid), privado.puede_editar(uuid), privado.es_admin(uuid) to authenticated;

alter table organizaciones enable row level security;
alter table miembros enable row level security;
alter table cultivos enable row level security;
alter table fincas enable row level security;
alter table lotes enable row level security;
alter table escenas enable row level security;
alter table observaciones enable row level security;
alter table evaluaciones enable row level security;
alter table eventos_manejo enable row level security;
alter table visitas enable row level security;
alter table trabajos enable row level security;
alter table alertas enable row level security;
alter table uso_demo enable row level security;
alter table config_sistema enable row level security;

-- Catálogos públicos de lectura
create policy cultivos_leer on cultivos for select to anon, authenticated using (true);
create policy escenas_leer on escenas for select to authenticated using (true);

-- organizaciones: miembro lee; admin edita; crear = cualquiera autenticado (se vuelve admin por trigger)
create policy org_sel on organizaciones for select to authenticated using (privado.es_miembro(id));
create policy org_ins on organizaciones for insert to authenticated with check (true);
create policy org_upd on organizaciones for update to authenticated using (privado.es_admin(id)) with check (privado.es_admin(id));
create policy org_del on organizaciones for delete to authenticated using (privado.es_admin(id));

create or replace function privado.creador_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into miembros (organizacion_id, user_id, rol) values (new.id, auth.uid(), 'admin');
  return new;
end $$;
create trigger org_creador_admin after insert on organizaciones for each row when (auth.uid() is not null) execute function privado.creador_admin();

-- miembros: miembros ven la lista; solo admin agrega/cambia/quita
create policy miem_sel on miembros for select to authenticated using (privado.es_miembro(organizacion_id));
create policy miem_ins on miembros for insert to authenticated with check (privado.es_admin(organizacion_id));
create policy miem_upd on miembros for update to authenticated using (privado.es_admin(organizacion_id)) with check (privado.es_admin(organizacion_id));
create policy miem_del on miembros for delete to authenticated using (privado.es_admin(organizacion_id));

-- Plantilla para tablas con organizacion_id: lectura = miembro; escritura = admin|tecnico; with check impide mover filas a otra organización
do $$
declare t text;
begin
  foreach t in array array['fincas','lotes','observaciones','evaluaciones','eventos_manejo','visitas','alertas'] loop
    execute format('create policy %I_sel on %I for select to authenticated using (privado.es_miembro(organizacion_id))', t, t);
    execute format('create policy %I_ins on %I for insert to authenticated with check (privado.puede_editar(organizacion_id))', t, t);
    execute format('create policy %I_upd on %I for update to authenticated using (privado.puede_editar(organizacion_id)) with check (privado.puede_editar(organizacion_id))', t, t);
    execute format('create policy %I_del on %I for delete to authenticated using (privado.es_admin(organizacion_id))', t, t);
  end loop;
end $$;

-- observaciones y evaluaciones las escribe solo el worker (service role); los miembros solo leen
drop policy observaciones_ins on observaciones; drop policy observaciones_upd on observaciones; drop policy observaciones_del on observaciones;
drop policy evaluaciones_ins on evaluaciones; drop policy evaluaciones_upd on evaluaciones; drop policy evaluaciones_del on evaluaciones;

-- lotes: la organización del lote debe ser la de su finca (coherencia del campo denormalizado)
create or replace function privado.lote_hereda_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select organizacion_id into new.organizacion_id from fincas where id = new.finca_id;
  if new.organizacion_id is null then raise exception 'finca inexistente'; end if;
  if tg_op = 'UPDATE' and new.geom::text is distinct from old.geom::text then
    new.geom_version := old.geom_version + 1; new.geom_updated_at := now();
  end if;
  return new;
end $$;
create trigger lote_org before insert or update on lotes for each row execute function privado.lote_hereda_org();

-- trabajos: miembros ven los de su organización (vía lote); solo el worker escribe
create policy trab_sel on trabajos for select to authenticated
  using (exists (select 1 from lotes l where l.id = trabajos.lote_id and privado.es_miembro(l.organizacion_id)));
-- miembros pueden encolar un histórico/reevaluación de sus lotes
create policy trab_ins on trabajos for insert to authenticated
  with check (exists (select 1 from lotes l where l.id = trabajos.lote_id and privado.puede_editar(l.organizacion_id)));

-- uso_demo y config_sistema: nadie desde el cliente (solo service role)
