import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { NIVEL, diasDesde, fmtFecha, fmtCambio } from '@/lib/formato';
import Serie from '@/components/Serie';
import FormVisita from '@/components/FormVisita';

export default async function FichaLote({ params }: PageProps<"/dashboard/lotes/[id]">) {
  const { id } = await params; const sb = await createClient();
  const { data: lote } = await sb.from('lotes').select('id,nombre,area_ha,fecha_siembra,cultivos(nombre,con_fuente,fuentes),fincas(nombre,municipio)').eq('id', id).single();
  if (!lote) notFound();
  const lf = lote as unknown as { cultivos: { nombre: string; con_fuente: boolean; fuentes: string[] } | null; fincas: { nombre: string; municipio: string | null } | null };
  const { data: obs } = await sb.from('observaciones').select('id,usable,pct_indice_valido,pct_agua,pct_nube_sombra,ndvi_mediana,ndvi_p10,ndvi_p90,ndmi_mediana,scl_stats,escenas(acquired_at,nube_escena)').eq('lote_id', id);
  const { data: evs } = await sb.from('evaluaciones').select('observacion_id,nivel,cambio,base_n,alert_candidate,recomendaciones,texto_ia').eq('lote_id', id);
  const { data: trab } = await sb.from('trabajos').select('tipo,estado,creado,error').eq('lote_id', id).order('creado', { ascending: false }).limit(1);
  const { data: visitas } = await sb.from('visitas').select('fecha,hallazgo,cambio_orden_visitas').eq('lote_id', id).order('fecha', { ascending: false }).limit(5);
  const { data: eventos } = await sb.from('eventos_manejo').select('fecha,tipo,notas').eq('lote_id', id).order('fecha', { ascending: false }).limit(5);
  type O = { id: string; usable: boolean; pct_indice_valido: number | null; pct_agua: number | null; pct_nube_sombra: number | null; ndvi_mediana: number | null; ndvi_p10: number | null; ndvi_p90: number | null; ndmi_mediana: number | null; scl_stats: { motivo?: string } | null; escenas: { acquired_at: string; nube_escena: number | null } | null };
  const lista = ((obs ?? []) as unknown as O[]).filter(o => o.escenas).sort((a, b) => b.escenas!.acquired_at.localeCompare(a.escenas!.acquired_at));
  const evPorObs = new Map((evs ?? []).map(e => [e.observacion_id, e]));
  const usables = lista.filter(o => o.usable); const ultima = usables[0]; const ev = ultima ? evPorObs.get(ultima.id) : undefined;
  const dias = diasDesde(ultima?.escenas?.acquired_at); const t = trab?.[0];
  const serie = [...usables].reverse().map(o => ({ fecha: o.escenas!.acquired_at.slice(0, 10), ndvi: o.ndvi_mediana!, ndmi: o.ndmi_mediana }));
  return (
    <div className="space-y-6">
      <div><Link href="/dashboard" className="text-sm text-verde underline">← Lista de lotes</Link>
        <h1 className="mt-1 text-2xl font-bold">{lf.fincas?.nombre} · {lote.nombre}</h1>
        <p className="text-sm text-stone-600">{lf.cultivos?.nombre ?? 'Sin cultivo'} · {lote.area_ha} ha{lf.fincas?.municipio ? ` · ${lf.fincas.municipio}` : ''}{lote.fecha_siembra ? ` · sembrado ${fmtFecha(lote.fecha_siembra)}` : ''}</p></div>
      {t && (t.estado === 'pendiente' || t.estado === 'procesando') && <div className="tarjeta border-amber-300 bg-amber-50">Buscando y procesando imágenes de los últimos 6 meses… normalmente 2 a 5 minutos. Recargue la página en un momento.</div>}
      {t && t.estado === 'fallido' && <div className="tarjeta border-red-300 bg-red-50">El último procesamiento falló y se reintentará solo. Detalle: {t.error}</div>}
      {!ultima && !(t && t.estado !== 'listo') && <div className="tarjeta">Todavía no hay ninguna observación válida de este lote (nubes en todas las imágenes del periodo).</div>}
      {ultima && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="tarjeta"><div className="text-xs text-stone-500">Última imagen válida</div><div className="text-xl font-bold">{fmtFecha(ultima.escenas!.acquired_at)}</div><div className={`text-sm ${dias! > 21 ? 'font-semibold text-amber-800' : 'text-stone-600'}`}>hace {dias} días{dias! > 21 ? ' · sin imagen válida reciente (nubes)' : ''}</div></div>
          <div className="tarjeta"><div className="text-xs text-stone-500">Cambio frente a sus observaciones anteriores</div><div className={`text-xl font-bold ${ev?.cambio != null && ev.cambio <= -0.1 ? 'text-red-800' : ''}`}>{fmtCambio(ev?.cambio)}</div><div className="text-sm text-stone-600">{ev?.base_n ? `base de ${ev.base_n} observación(es)` : 'primera observación'}{ev?.alert_candidate ? ' · cambio marcado: revisar en campo' : ''}</div></div>
          <div className="tarjeta"><div className="text-xs text-stone-500">NDVI (mediana) · nivel</div><div className="text-xl font-bold">{ultima.ndvi_mediana?.toFixed(2)}</div><div className="text-sm"><span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${NIVEL[ev?.nivel ?? 'sin_regla']?.color}`}>{NIVEL[ev?.nivel ?? 'sin_regla']?.texto}</span></div></div>
        </div>
      )}
      {serie.length > 1 && <div className="tarjeta"><h2 className="font-semibold">Serie de observaciones válidas</h2><Serie datos={serie} /></div>}
      {ev && (
        <div className="tarjeta"><h2 className="font-semibold">Qué revisar en campo</h2>
          <ul className="mt-2 space-y-2">{(ev.recomendaciones as { prioridad: string; texto: string; fuente: string | null }[]).map((r, i) => (
            <li key={i} className="flex gap-2 text-sm"><span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-semibold">{r.prioridad}</span><span>{r.texto}{r.fuente && <span className="text-stone-500"> · Fuente: {r.fuente}</span>}</span></li>))}</ul>
          <p className="mt-3 text-xs text-stone-500">CultiVista señala cambios y zonas que merecen revisión. No diagnostica plagas ni enfermedades ni reemplaza la visita del técnico.</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="tarjeta"><h2 className="font-semibold">Visitas y hallazgos</h2>
          <ul className="mt-2 space-y-1 text-sm">{(visitas ?? []).map((v, i) => <li key={i}><b>{fmtFecha(v.fecha)}</b>: {v.hallazgo ?? 'sin nota'}{v.cambio_orden_visitas ? ' · cambió el orden de visitas' : ''}</li>)}{!visitas?.length && <li className="text-stone-500">Ninguna todavía.</li>}</ul>
          <FormVisita loteId={id} evaluacionObsId={ultima?.id ?? null} /></div>
        <div className="tarjeta"><h2 className="font-semibold">Eventos de manejo</h2>
          <ul className="mt-2 space-y-1 text-sm">{(eventos ?? []).map((e, i) => <li key={i}><b>{fmtFecha(e.fecha)}</b>: {e.tipo}{e.notas ? ` · ${e.notas}` : ''}</li>)}{!eventos?.length && <li className="text-stone-500">Ninguno registrado. Poda, cosecha o renovación explican caídas legítimas del índice.</li>}</ul></div>
      </div>
      <div className="tarjeta"><h2 className="font-semibold">Todas las imágenes del periodo</h2><p className="text-xs text-stone-500">Las no usables no generan índice: se muestran para que sepa por qué no hay dato.</p>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-stone-500"><th className="py-1">Fecha</th><th>Válido en el lote</th><th>Nube/sombra</th><th>NDVI</th><th>NDMI</th><th>Cambio</th></tr></thead>
          <tbody>{lista.map(o => { const e = evPorObs.get(o.id); return (<tr key={o.id} className={`border-t border-borde ${o.usable ? '' : 'text-stone-400'}`}><td className="py-1">{fmtFecha(o.escenas!.acquired_at)}</td><td>{o.pct_indice_valido ?? 0} %{o.usable ? '' : ' · no usable'}</td><td>{o.pct_nube_sombra ?? '—'} %</td><td>{o.ndvi_mediana?.toFixed(2) ?? '—'}</td><td>{o.ndmi_mediana?.toFixed(2) ?? '—'}</td><td>{fmtCambio(e?.cambio)}</td></tr>); })}</tbody></table></div></div>
    </div>
  );
}
