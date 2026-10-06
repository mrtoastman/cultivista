-- 0005 · Una observación por lote y día (tiles solapados generan dos escenas el mismo día).
alter table observaciones add column if not exists fecha_obs date;
update observaciones o set fecha_obs = (e.acquired_at at time zone 'UTC')::date from escenas e where e.id = o.escena_id and o.fecha_obs is null;
-- Deduplicar lo ya cargado: conservar la observación con mayor pct_indice_valido por (lote, fecha, versión)
with ranked as (
  select id, row_number() over (partition by lote_id, fecha_obs, processing_version order by coalesce(pct_indice_valido,0) desc, coalesce(n_px_scl,0) desc, creada) rn
  from observaciones)
delete from observaciones where id in (select id from ranked where rn > 1);
alter table observaciones alter column fecha_obs set not null;
create unique index if not exists obs_lote_fecha_version on observaciones(lote_id, fecha_obs, processing_version);
