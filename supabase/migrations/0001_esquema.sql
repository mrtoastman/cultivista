-- CultiVista v2 · 0001 esquema base (diseño §5 + §14). Idempotente.
create extension if not exists postgis;
create extension if not exists pgcrypto;

create type rol_miembro as enum ('admin','tecnico','lector');
create type tipo_organizacion as enum ('cooperativa','finca','demo');
create type estado_trabajo as enum ('pendiente','procesando','listo','fallido');
create type tipo_trabajo as enum ('historico_6m','observacion_nueva','reevaluar');
create type tipo_evento_manejo as enum ('poda','cosecha','renovacion','siembra','inundacion','fertilizacion','otro');
create type nivel_indice as enum ('bajo','esperado','alto','sin_regla');

create table organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo tipo_organizacion not null default 'finca',
  plan text not null default 'beta',
  umbral_valido numeric not null default 60 check (umbral_valido between 0 and 100),
  min_px_scl int not null default 8,
  correo_alertas text,
  creada timestamptz not null default now()
);

create table miembros (
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol rol_miembro not null default 'lector',
  creado timestamptz not null default now(),
  primary key (organizacion_id, user_id)
);
create index miembros_user_org on miembros(user_id, organizacion_id);

create table cultivos (
  id text primary key,                       -- 'cafe','cacao','arroz'
  nombre text not null,
  categoria text not null,
  umbrales jsonb not null,                   -- {"bajo_max":0.4,"esperado_max":0.65}
  fuentes jsonb not null default '[]',
  reglas jsonb not null default '[]',        -- [{id, condicion, prioridad, texto, fuente}]
  reglas_version text not null default 'reglas_v1',
  con_fuente boolean not null default false
);

create table fincas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nombre text not null,
  municipio text,
  departamento text,
  tecnico_responsable_id uuid references auth.users(id),
  notas text,
  creada timestamptz not null default now()
);
create index fincas_org on fincas(organizacion_id);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id) on delete cascade, -- denormalizado para RLS
  nombre text not null,
  cultivo_id text references cultivos(id),
  geom geometry(Polygon, 4326) not null,
  area_ha numeric generated always as (round((st_area(geom::geography) / 10000)::numeric, 2)) stored,
  fecha_siembra date,
  tecnico_responsable_id uuid references auth.users(id),
  geom_version int not null default 1,
  geom_updated_at timestamptz not null default now(),
  activo boolean not null default true,
  creado timestamptz not null default now(),
  constraint lote_area_razonable check (st_area(geom::geography) between 1000 and 5e7)
);
create index lotes_finca on lotes(finca_id, activo);
create index lotes_org on lotes(organizacion_id);
create index lotes_geom on lotes using gist(geom);

create table escenas (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,                   -- 'earth-search'
  item_id text not null,
  tile text,
  acquired_at timestamptz not null,
  provider_published_at timestamptz,
  epsg int,
  processing_baseline text,
  nube_escena numeric,
  creada timestamptz not null default now(),
  unique (proveedor, item_id)
);

create table observaciones (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  escena_id uuid not null references escenas(id),
  usable boolean not null,
  pct_clasificado numeric, pct_indice_valido numeric, pct_vegetacion numeric,
  pct_suelo numeric, pct_agua numeric, pct_nube_sombra numeric,
  n_px_scl int, n_px_indice int,
  scl_stats jsonb,
  ndvi_media numeric, ndvi_mediana numeric, ndvi_p10 numeric, ndvi_p90 numeric, ndvi_std numeric,
  ndmi_mediana numeric,                      -- grilla 20 m
  otros_indices jsonb,                       -- {evi, gndvi, msavi, ndre} medianas (laboratorio)
  mapa_png_path text,
  processing_version text not null,
  mask_version text not null,
  algorithm_version text not null,
  creada timestamptz not null default now(),
  unique (lote_id, escena_id, processing_version)
);
create index obs_lote_fecha on observaciones(lote_id, creada desc);
create index obs_lote_usable on observaciones(lote_id, usable, creada desc);
create index obs_org on observaciones(organizacion_id);

create table evaluaciones (
  id uuid primary key default gen_random_uuid(),
  observacion_id uuid not null references observaciones(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nivel nivel_indice not null,
  cambio numeric,                            -- mediana actual − mediana(medianas 3 últimas)
  base_n int not null default 0,
  baseline_ids uuid[] not null default '{}',
  alert_candidate boolean not null default false,
  recomendaciones jsonb not null default '[]',
  rules_version text not null,
  texto_ia text, modelo_ia text, ia_valida boolean,
  pdf_path text,
  creada timestamptz not null default now()
);
create index eval_lote on evaluaciones(lote_id, creada desc);

create table eventos_manejo (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  fecha date not null,
  tipo tipo_evento_manejo not null,
  notas text,
  creado_por uuid references auth.users(id),
  creado timestamptz not null default now()
);
create index eventos_lote on eventos_manejo(lote_id, fecha desc);

create table visitas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  evaluacion_id uuid references evaluaciones(id),
  fecha date not null default current_date,
  hallazgo text,                             -- «qué encontré»
  cambio_orden_visitas boolean,              -- hipótesis central del piloto
  creado_por uuid references auth.users(id),
  creado timestamptz not null default now()
);
create index visitas_lote on visitas(lote_id, fecha desc);

create table trabajos (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_trabajo not null,
  lote_id uuid references lotes(id) on delete cascade,
  escena_id uuid references escenas(id),
  processing_version text not null,
  estado estado_trabajo not null default 'pendiente',
  intentos int not null default 0,
  next_retry_at timestamptz,
  locked_at timestamptz, worker_id text,
  etapa_fallida text, error text,
  creado timestamptz not null default now(), iniciado timestamptz, terminado timestamptz
);
create unique index trabajos_idempotente on trabajos(tipo, lote_id, coalesce(escena_id,'00000000-0000-0000-0000-000000000000'::uuid), processing_version);
create index trabajos_estado on trabajos(estado, creado);

create table alertas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  evaluacion_id uuid references evaluaciones(id),
  tipo text not null,
  estado text not null default 'candidata',  -- candidata | enviada | suprimida | error
  motivo text,
  enviada_a text, enviada_en timestamptz,
  creada timestamptz not null default now()
);
create index alertas_lote on alertas(lote_id, enviada_en desc);

create table uso_demo (
  huella text not null,
  fecha date not null default current_date,
  analisis int not null default 0,
  primary key (huella, fecha)
);

create table config_sistema (
  clave text primary key,
  valor jsonb not null
);
insert into config_sistema values
  ('alerta_caida_ndvi', '{"activa": false, "umbral": 0.10}'),
  ('versiones', '{"processing_version":"proc_v1","mask_version":"mask_v1","algorithm_version":"indices_v1"}');

-- Catálogo inicial: solo cultivos con reglas con fuente (café, cacao, arroz). Umbrales = PUNTO DE PARTIDA [S], calibrar.
insert into cultivos (id, nombre, categoria, umbrales, fuentes, reglas, con_fuente) values
 ('cafe','Café','permanente','{"bajo_max":0.40,"esperado_max":0.80}','["Cenicafé"]',
  '[{"id":"cafe_bajo_1","nivel":"bajo","prioridad":"ALTA","texto":"Revisar sombrío (40-60 %) y presencia de broca; si supera 2 % de frutos, aplicar Beauveria bassiana.","fuente":"Cenicafé"},
    {"id":"cafe_bajo_2","nivel":"bajo","prioridad":"MEDIA","texto":"Verificar plan de fertilización 132-42-82 kg/ha de N-P2O5-K2O en dos fracciones.","fuente":"Cenicafé"},
    {"id":"cafe_esp_1","nivel":"esperado","prioridad":"INFO","texto":"Mantener sombrío 40-60 % y monitoreo de broca (<2 %) y roya (<3-4 % de hojas).","fuente":"Cenicafé"}]', true),
 ('cacao','Cacao','permanente','{"bajo_max":0.45,"esperado_max":0.80}','["Fedecacao","Agrosavia"]',
  '[{"id":"cacao_bajo_1","nivel":"bajo","prioridad":"ALTA","texto":"Remoción semanal de frutos enfermos (monilia) y poda de ramas con escoba de bruja cada 2-3 meses.","fuente":"Fedecacao"},
    {"id":"cacao_bajo_2","nivel":"bajo","prioridad":"MEDIA","texto":"Revisar fertilización 12-8-16-2 (N-P-K-Mg), 150-200 g por árbol.","fuente":"Fedecacao"},
    {"id":"cacao_esp_1","nivel":"esperado","prioridad":"INFO","texto":"Mantener remoción de frutos enfermos y podas de mantenimiento.","fuente":"Fedecacao"}]', true),
 ('arroz','Arroz','transitorio','{"bajo_max":0.35,"esperado_max":0.70}','["Fedearroz-AMTEC"]',
  '[{"id":"arroz_bajo_1","nivel":"bajo","prioridad":"ALTA","texto":"Verificar lámina de agua y monitorear sogata (umbral 9 insectos por pase de jama).","fuente":"Fedearroz-AMTEC"},
    {"id":"arroz_bajo_2","nivel":"bajo","prioridad":"MEDIA","texto":"Revisar fertilización N 105-185, P 40-60, K 60-135 kg/ha según etapa.","fuente":"Fedearroz-AMTEC"},
    {"id":"arroz_esp_1","nivel":"esperado","prioridad":"INFO","texto":"Monitorear piricularia en hoja bandera (>5 % severidad requiere manejo).","fuente":"Fedearroz-AMTEC"}]', true);
