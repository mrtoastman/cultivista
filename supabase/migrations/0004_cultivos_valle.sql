-- 0004 · Cultivos del centro y norte del Valle del Cauca SIN reglas con fuente todavía (nivel = sin_regla; solo cambio relativo).
-- Pendiente: reglas con fuente de Cenicaña (caña), ICA/Agrosavia (cítricos, aguacate), Augura/ICA (plátano). No inventar umbrales.
insert into cultivos (id, nombre, categoria, umbrales, fuentes, reglas, con_fuente) values
 ('cana',     'Caña de azúcar', 'semipermanente', '{}', '[]', '[]', false),
 ('citricos', 'Cítricos',       'permanente',     '{}', '[]', '[]', false),
 ('aguacate', 'Aguacate',       'permanente',     '{}', '[]', '[]', false),
 ('platano',  'Plátano',        'permanente',     '{}', '[]', '[]', false),
 ('frutales', 'Frutales (otros)','permanente',    '{}', '[]', '[]', false)
on conflict (id) do nothing;
