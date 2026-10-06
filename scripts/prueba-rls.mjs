// Prueba de aislamiento (diseño §14.6): dos usuarios, dos organizaciones; verifica SELECT/INSERT/UPDATE/DELETE cruzados.
// Usa la clave secreta solo para crear/borrar los usuarios de prueba; las consultas van con JWT de cada usuario.
import { readFileSync } from 'node:fs'; import { homedir } from 'node:os';
const env = Object.fromEntries(readFileSync(`${homedir()}/Library/Application Support/Optimus/Produccion/CULTIVISTA/.env`, 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const U = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY, SEC = env.SUPABASE_SERVICE_ROLE_KEY;
const stamp = Date.now(); const pass = 'Prueba-' + stamp;
const admin = (path, opt = {}) => fetch(U + path, { ...opt, headers: { apikey: SEC, Authorization: 'Bearer ' + SEC, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
async function usuario(nombre) {
  const r = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: `rls-${nombre}-${stamp}@prueba.cultivista.local`, password: pass, email_confirm: true }) });
  const u = await r.json(); if (!u.id) throw new Error('crear usuario: ' + JSON.stringify(u));
  const s = await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: pass }) });
  const t = await s.json(); if (!t.access_token) throw new Error('login: ' + JSON.stringify(t));
  const api = async (path, opt = {}) => { const r = await fetch(U + '/rest/v1' + path, { ...opt, headers: { apikey: ANON, Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } }); const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; } return { status: r.status, body: j }; };
  return { id: u.id, api };
}
const ok = []; const mal = [];
const check = (nombre, cond, detalle) => (cond ? ok : mal).push(nombre + (cond ? '' : ' → ' + JSON.stringify(detalle).slice(0, 200)));
const A = await usuario('a'), B = await usuario('b');
try {
  const orgA = (await A.api('/rpc/crear_organizacion', { method: 'POST', body: JSON.stringify({ p_nombre: 'Coop A ' + stamp, p_tipo: 'cooperativa' }) })).body;
  const orgB = (await B.api('/rpc/crear_organizacion', { method: 'POST', body: JSON.stringify({ p_nombre: 'Finca B ' + stamp, p_tipo: 'finca' }) })).body;
  const dirB = await B.api('/organizaciones', { method: 'POST', body: JSON.stringify({ nombre: 'directa', tipo: 'finca' }) }); check('insert directo en organizaciones bloqueado (solo RPC)', dirB.status >= 400, dirB);
  check('crear organización devuelve fila', !!orgA?.id && !!orgB?.id, [orgA, orgB]);
  const miemA = await A.api(`/miembros?organizacion_id=eq.${orgA.id}`); check('creador queda como admin (RPC)', miemA.body?.[0]?.rol === 'admin', miemA.body);
  const fincaA = (await A.api('/fincas', { method: 'POST', body: JSON.stringify({ organizacion_id: orgA.id, nombre: 'Finca de A', municipio: 'Buga' }) })).body[0];
  check('A crea finca en su organización', !!fincaA?.id, fincaA);
  const poli = { type: 'Polygon', coordinates: [[[-76.4447, 3.9205], [-76.4429, 3.9205], [-76.4429, 3.9223], [-76.4447, 3.9223], [-76.4447, 3.9205]]] };
  const loteA = (await A.api('/lotes', { method: 'POST', body: JSON.stringify({ finca_id: fincaA.id, organizacion_id: orgB.id /* intento de poner otra org: el trigger la corrige */, nombre: 'Lote 1', cultivo_id: 'cafe', geom: poli }) })).body[0];
  check('A crea lote (PostGIS) y hereda la organización de la finca aunque mande otra', loteA?.organizacion_id === orgA.id && loteA?.area_ha > 3 && loteA?.area_ha < 5, loteA);
  // B no ve nada de A
  const vB = await B.api('/fincas?select=id,nombre'); check('B no ve fincas de A (lista vacía)', vB.status === 200 && vB.body.length === 0, vB);
  const lB = await B.api('/lotes?select=id'); check('B no ve lotes de A', lB.body.length === 0, lB);
  const oB = await B.api('/organizaciones?select=id'); check('B solo ve su organización', oB.body.length === 1 && oB.body[0].id === orgB.id, oB);
  const mB = await B.api(`/miembros?organizacion_id=eq.${orgA.id}`); check('B no ve miembros de A', mB.body.length === 0, mB);
  // B no escribe en A
  const iB = await B.api('/fincas', { method: 'POST', body: JSON.stringify({ organizacion_id: orgA.id, nombre: 'intrusa' }) }); check('B no inserta finca en A', iB.status >= 400, iB);
  const uB = await B.api(`/fincas?id=eq.${fincaA.id}`, { method: 'PATCH', body: JSON.stringify({ nombre: 'hackeada' }) }); check('B no actualiza finca de A (0 filas)', uB.status === 200 && uB.body.length === 0, uB);
  const dB = await B.api(`/lotes?id=eq.${loteA.id}`, { method: 'DELETE' }); check('B no borra lote de A (0 filas)', dB.status === 200 && dB.body.length === 0, dB);
  const mvB = await B.api(`/lotes?id=eq.${loteA.id}`, { method: 'PATCH', body: JSON.stringify({ finca_id: fincaA.id, organizacion_id: orgB.id }) }); check('B no mueve el lote de A a su organización', mvB.body.length === 0, mvB);
  const memB = await B.api('/miembros', { method: 'POST', body: JSON.stringify({ organizacion_id: orgA.id, user_id: B.id, rol: 'admin' }) }); check('B no se auto-agrega como miembro de A', memB.status >= 400, memB);
  // A tampoco puede escribir observaciones (solo el worker)
  const obsA = await A.api('/observaciones', { method: 'POST', body: JSON.stringify({ lote_id: loteA.id, organizacion_id: orgA.id, escena_id: '00000000-0000-0000-0000-000000000000', usable: false, processing_version: 'x', mask_version: 'x', algorithm_version: 'x' }) }); check('miembro no inserta observaciones (solo worker)', obsA.status >= 400, obsA);
  const cfg = await A.api('/config_sistema'); check('config_sistema invisible para miembros', cfg.body.length === 0, cfg);
  // Lector: A agrega a B como lector de A y B no puede escribir pero sí leer
  const addL = await A.api('/miembros', { method: 'POST', body: JSON.stringify({ organizacion_id: orgA.id, user_id: B.id, rol: 'lector' }) }); check('admin A agrega lector', addL.status === 201, addL);
  const vB2 = await B.api('/fincas?select=id'); check('lector ve fincas de A', vB2.body.length === 1, vB2);
  const iB2 = await B.api('/eventos_manejo', { method: 'POST', body: JSON.stringify({ lote_id: loteA.id, organizacion_id: orgA.id, fecha: '2026-10-06', tipo: 'poda' }) }); check('lector no escribe eventos', iB2.status >= 400, iB2);
  const trab = await A.api('/trabajos', { method: 'POST', body: JSON.stringify({ tipo: 'historico_6m', lote_id: loteA.id, processing_version: 'proc_v1' }) }); check('admin encola trabajo histórico de su lote', trab.status === 201, trab);
  const trab2 = await A.api('/trabajos', { method: 'POST', body: JSON.stringify({ tipo: 'historico_6m', lote_id: loteA.id, processing_version: 'proc_v1' }) }); check('trabajo duplicado rechazado por constraint', trab2.status === 409, trab2);
} finally {
  // limpieza: borrar usuarios (cascada a miembros; organizaciones quedan huérfanas → borrarlas con la clave secreta)
  await admin('/rest/v1/organizaciones?nombre=like.*' + stamp, { method: 'DELETE' });
  await admin('/auth/v1/admin/users/' + A.id, { method: 'DELETE' }); await admin('/auth/v1/admin/users/' + B.id, { method: 'DELETE' });
}
console.log('OK (' + ok.length + ')'); ok.forEach(x => console.log('  ✓', x));
if (mal.length) { console.log('FALLAN (' + mal.length + ')'); mal.forEach(x => console.log('  ✗', x)); process.exit(1); }
