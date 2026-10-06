# CultiVista v2

Monitoreo satelital de lotes agrícolas (Sentinel-2) para cooperativas y fincas en Colombia: vea dónde cambió el cultivo y qué revisar en campo.

- Diseño: `docs/DISENO-v2.md` (validado en dos etapas con ChatGPT; §14 prevalece).
- `supabase/migrations/` — esquema y RLS (se aplican con `node scripts/aplicar-migraciones.mjs`).
- `motor/` — motor Python: STAC → COG por ventana → máscara SCL → índices → estadísticas. Pruebas: `cd motor && pytest`.
- `app/` — Next.js (semana 2).

Variables de entorno: ver `.env.example`; el archivo real vive fuera del repo (`~/Library/Application Support/Optimus/Produccion/CULTIVISTA/.env`).

Vocabulario prohibido en producto y marketing: «alerta temprana de plagas», «diagnóstico remoto», «detectamos enfermedades», «precisión», «tiempo real».
