// Aplica supabase/migrations/*.sql en orden sobre la base indicada por DATABASE_URL o el .env de Produccion.
// Uso: node scripts/aplicar-migraciones.mjs [--solo 0001] [--local]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import pg from 'pg';

const args = process.argv.slice(2);
const solo = args.includes('--solo') ? args[args.indexOf('--solo') + 1] : null;
let url = process.env.DATABASE_URL;
if (!url && args.includes('--local')) url = 'postgresql://postgres:cultivista@localhost:54330/postgres';
if (!url) {
  const envPath = `${homedir()}/Library/Application Support/Optimus/Produccion/CULTIVISTA/.env`;
  if (!existsSync(envPath)) throw new Error('Sin DATABASE_URL ni .env de Produccion');
  const env = Object.fromEntries(readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  if (!env.SUPABASE_DB_PASSWORD) throw new Error('Falta SUPABASE_DB_PASSWORD en el .env de Produccion');
  url = `postgresql://postgres.${env.SUPABASE_PROJECT_REF}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
  process.env.CULTIVISTA_DIRECT_URL = `postgresql://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@db.${env.SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`;
}
const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
try { await client.connect(); } catch (e) {
  if (process.env.CULTIVISTA_DIRECT_URL) { console.log('pooler no disponible, probando conexión directa…'); url = process.env.CULTIVISTA_DIRECT_URL; }
  else throw e;
}
const c = client._connected ? client : new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
if (!client._connected) await c.connect();
await c.query('create table if not exists _migraciones (nombre text primary key, aplicada timestamptz default now())');
const hechas = new Set((await c.query('select nombre from _migraciones')).rows.map(r => r.nombre));
for (const f of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
  if (solo && !f.startsWith(solo)) continue;
  if (hechas.has(f)) { console.log('ya aplicada', f); continue; }
  console.log('aplicando', f);
  await c.query('begin');
  try { await c.query(readFileSync(`supabase/migrations/${f}`, 'utf8')); await c.query('insert into _migraciones (nombre) values ($1)', [f]); await c.query('commit'); }
  catch (e) { await c.query('rollback'); console.error('FALLÓ', f, e.message); process.exit(1); }
}
console.log('listo');
await c.end();
