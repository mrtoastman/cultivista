import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { NIVEL, diasDesde, fmtFecha, fmtCambio, accionSugerida } from '@/lib/formato';

type Fila = { id: string; nombre: string; finca: string; municipio: string | null; cultivo: string | null; area: number | null; ultima: string | null; ndvi: number | null; cambio: number | null; nivel: string | null; dias: number | null; accion: { texto: string; peso: number }; pendientes: number };

export default async function Tablero() {
  const sb = await createClient();
  const { data: orgs } = await sb.from('organizaciones').select('id,nombre,tipo');
  if (!orgs?.length) return (
    <div className="tarjeta max-w-lg"><h1 className="text-xl font-bold">Bienvenido</h1><p className="mt-2 text-stone-700">Para empezar, cree su organización: una finca o una cooperativa con varias fincas.</p><Link href="/dashboard/organizacion/nueva" className="btn-primario mt-4">Crear organización</Link></div>
  );
  const { data: lotes } = await sb.from('lotes').select('id,nombre,area_ha,activo,cultivos(nombre),fincas(nombre,municipio)').eq('activo', true).order('creado');
  const ids = (lotes ?? []).map(l => l.id);
  // última observación usable por lote (vía escena) + última evaluación
  const { data: obs } = ids.length ? await sb.from('observaciones').select('id,lote_id,ndvi_mediana,escenas(acquired_at)').in('lote_id', ids).eq('usable', true) : { data: [] as never[] };
  const { data: evs } = ids.length ? await sb.from('evaluaciones').select('observacion_id,lote_id,nivel,cambio,creada').in('lote_id', ids) : { data: [] as never[] };
  const { data: trab } = ids.length ? await sb.from('trabajos').select('lote_id,estado').in('lote_id', ids).in('estado', ['pendiente', 'procesando']) : { data: [] as never[] };
  const ultimaPorLote = new Map<string, { id: string; fecha: string; ndvi: number }>();
  for (const o of (obs ?? []) as unknown as { id: string; lote_id: string; ndvi_mediana: number; escenas: { acquired_at: string } | null }[]) {
    const f = o.escenas?.acquired_at; if (!f) continue;
    const prev = ultimaPorLote.get(o.lote_id);
    if (!prev || f > prev.fecha) ultimaPorLote.set(o.lote_id, { id: o.id, fecha: f, ndvi: o.ndvi_mediana });
  }
  const evPorObs = new Map((evs ?? []).map(e => [e.observacion_id, e]));
  const pend = new Map<string, number>(); for (const t of trab ?? []) pend.set(t.lote_id, (pend.get(t.lote_id) ?? 0) + 1);
  const filas: Fila[] = (lotes ?? []).map(l => {
    const u = ultimaPorLote.get(l.id); const ev = u ? evPorObs.get(u.id) : undefined;
    const dias = diasDesde(u?.fecha); const cambio = ev?.cambio ?? null; const nivel = ev?.nivel ?? null;
    const lf = l as unknown as { cultivos: { nombre: string } | null; fincas: { nombre: string; municipio: string | null } | null };
    return { id: l.id, nombre: l.nombre, finca: lf.fincas?.nombre ?? '', municipio: lf.fincas?.municipio ?? null, cultivo: lf.cultivos?.nombre ?? null, area: l.area_ha, ultima: u?.fecha ?? null, ndvi: u?.ndvi ?? null, cambio, nivel, dias, accion: accionSugerida(cambio, dias, nivel), pendientes: pend.get(l.id) ?? 0 };
  }).sort((a, b) => b.accion.peso - a.accion.peso);
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{orgs[0].nombre}</h1><p className="text-sm text-stone-600">{filas.length} lotes · ordenados por lo que conviene revisar primero</p></div>
        <Link href="/dashboard/lotes/nuevo" className="btn-primario">Nuevo lote</Link>
      </div>
      {filas.length === 0 && <div className="tarjeta mt-6"><p>Todavía no hay lotes. Dibuje el primero y CultiVista buscará las imágenes de los últimos 6 meses.</p></div>}
      <ul className="mt-6 space-y-2">
        {filas.map(f => (
          <li key={f.id}><Link href={`/dashboard/lotes/${f.id}`} className="tarjeta block hover:border-verde">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div><span className="font-semibold">{f.finca}</span> <span className="text-stone-500">· {f.nombre}</span>{f.cultivo && <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs">{f.cultivo}</span>}</div>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${f.accion.peso >= 100 ? 'bg-red-100 text-red-900' : f.accion.peso >= 30 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>{f.pendientes ? 'Procesando…' : f.accion.texto}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm sm:grid-cols-5">
              <div><div className="text-xs text-stone-500">Última imagen válida</div><div>{fmtFecha(f.ultima)}{f.dias !== null && <span className="text-stone-500"> · {f.dias} d</span>}</div></div>
              <div><div className="text-xs text-stone-500">Cambio</div><div className={f.cambio !== null && f.cambio <= -0.1 ? 'font-semibold text-red-800' : ''}>{fmtCambio(f.cambio)}</div></div>
              <div><div className="text-xs text-stone-500">NDVI</div><div>{f.ndvi?.toFixed(2) ?? '—'}</div></div>
              <div className="hidden sm:block"><div className="text-xs text-stone-500">Nivel</div><div>{f.nivel ? NIVEL[f.nivel]?.texto : '—'}</div></div>
              <div className="hidden sm:block"><div className="text-xs text-stone-500">Área</div><div>{f.area ?? '—'} ha</div></div>
            </div>
          </Link></li>
        ))}
      </ul>
    </div>
  );
}
