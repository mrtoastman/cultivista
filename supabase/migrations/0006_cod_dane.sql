-- 0006 · Código DANE (DIVIPOLA) del municipio de la finca; el nombre y el departamento se toman de la lista oficial en la app.
alter table fincas add column if not exists cod_dane char(5);
create index if not exists fincas_cod_dane on fincas(cod_dane);
