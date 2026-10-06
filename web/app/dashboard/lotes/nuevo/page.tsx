'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getSupabase } from '@/lib/supabase';
import SelectorMunicipio, { type Municipio } from '@/components/SelectorMunicipio';
const MapaLote = dynamic(() => import('@/components/MapaLote'), { ssr: false });
type Finca = { id: string; nombre: string; municipio: string | null };
export default function NuevoLote() {
  const r = useRouter(); const sb = getSupabase();
  const [fincas, setFincas] = useState<Finca[]>([]); const [cultivos, setCultivos] = useState<{ id: string; nombre: string; con_fuente: boolean }[]>([]);
  const [fincaId, setFincaId] = useState(''); const [fincaNueva, setFincaNueva] = useState(''); const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const [nombre, setNombre] = useState('Lote 1'); const [cultivo, setCultivo] = useState('cafe'); const [siembra, setSiembra] = useState('');
  const [poli, setPoli] = useState<[number, number][] | null>(null); const [area, setArea] = useState(0); const [msg, setMsg] = useState(''); const [cargando, setCargando] = useState(false);
  useEffect(() => { (async () => {
    const { data: f } = await sb.from('fincas').select('id,nombre,municipio').order('nombre'); setFincas(f ?? []); if (f?.length) setFincaId(f[0].id);
    const { data: c } = await sb.from('cultivos').select('id,nombre,con_fuente').order('con_fuente', { ascending: false }).order('nombre'); setCultivos(c ?? []);
  })(); }, [sb]);
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!poli) return setMsg('Dibuje el lote en el mapa (mínimo 3 puntos).');
    if (area < 0.3 || area > 500) return setMsg(`El área debe estar entre 0,3 y 500 ha (ahora ${area.toFixed(2)} ha).`);
    setCargando(true);
    let fid = fincaId;
    if (fincaId === '__nueva' || !fincas.length) {
      const { data: org } = await sb.from('organizaciones').select('id').limit(1).single();
      const { data: f, error } = await sb.from('fincas').insert({ organizacion_id: org!.id, nombre: fincaNueva || 'Mi finca', municipio: municipio?.m ?? null, departamento: municipio?.d ?? null, cod_dane: municipio?.c ?? null }).select('id').single();
      if (error) { setCargando(false); return setMsg(error.message); } fid = f.id;
    }
    const geom = { type: 'Polygon', coordinates: [[...poli, poli[0]]] };
    const { data: finca } = await sb.from('fincas').select('organizacion_id').eq('id', fid).single();
    const { data: lote, error } = await sb.from('lotes').insert({ finca_id: fid, organizacion_id: finca!.organizacion_id, nombre, cultivo_id: cultivo, geom, fecha_siembra: siembra || null }).select('id').single();
    if (error) { setCargando(false); return setMsg(error.message); }
    await sb.from('trabajos').insert({ tipo: 'historico_6m', lote_id: lote.id, processing_version: 'proc_v1' });
    r.push(`/dashboard/lotes/${lote.id}`); r.refresh();
  }
  const sinFuente = cultivos.find(c => c.id === cultivo)?.con_fuente === false;
  return (
    <form onSubmit={guardar} className="space-y-4">
      <h1 className="text-2xl font-bold">Nuevo lote</h1>
      <MapaLote onCambio={(p, a) => { setPoli(p); setArea(a); }} irA={municipio ? [municipio.lon, municipio.lat] : null} />
      {(fincaId === '__nueva' || !fincas.length) && <p className="text-sm text-stone-600">Consejo: elija primero el municipio y el mapa se centrará allí.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="etiqueta">Finca</label>
          <select className="campo" value={fincas.length ? fincaId : '__nueva'} onChange={e => setFincaId(e.target.value)}>
            {fincas.map(f => <option key={f.id} value={f.id}>{f.nombre}{f.municipio ? ` · ${f.municipio}` : ''}</option>)}<option value="__nueva">+ Nueva finca</option>
          </select></div>
        {(fincaId === '__nueva' || !fincas.length) && <>
          <div><label className="etiqueta">Nombre de la finca</label><input className="campo" value={fincaNueva} onChange={e => setFincaNueva(e.target.value)} required /></div>
          <div><label className="etiqueta">Municipio (lista DANE)</label><SelectorMunicipio valor={municipio} onCambio={setMunicipio} /></div></>}
        <div><label className="etiqueta">Nombre del lote</label><input className="campo" value={nombre} onChange={e => setNombre(e.target.value)} required /></div>
        <div><label className="etiqueta">Cultivo</label><select className="campo" value={cultivo} onChange={e => setCultivo(e.target.value)}>{cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.con_fuente ? '' : ' (sin reglas con fuente aún)'}</option>)}</select>
          {sinFuente && <p className="mt-1 text-xs text-stone-600">Para este cultivo CultiVista mostrará solo el cambio relativo del lote, sin recomendaciones.</p>}</div>
        <div><label className="etiqueta">Fecha de siembra (opcional)</label><input className="campo" type="date" value={siembra} onChange={e => setSiembra(e.target.value)} /></div>
      </div>
      {msg && <p className="text-sm text-amber-800">{msg}</p>}
      <button className="btn-primario" disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar y buscar imágenes de 6 meses'}</button>
    </form>
  );
}
