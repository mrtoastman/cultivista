'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
export default function FormVisita({ loteId, evaluacionObsId }: { loteId: string; evaluacionObsId: string | null }) {
  const r = useRouter(); const [abierto, setAbierto] = useState(false); const [hallazgo, setHallazgo] = useState(''); const [cambio, setCambio] = useState<boolean | null>(null); const [tipoEvento, setTipoEvento] = useState(''); const [msg, setMsg] = useState('');
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); const sb = getSupabase();
    const { data: lote } = await sb.from('lotes').select('organizacion_id').eq('id', loteId).single();
    const { data: { user } } = await sb.auth.getUser();
    let evaluacion_id: string | null = null;
    if (evaluacionObsId) { const { data: ev } = await sb.from('evaluaciones').select('id').eq('observacion_id', evaluacionObsId).maybeSingle(); evaluacion_id = ev?.id ?? null; }
    const { error } = await sb.from('visitas').insert({ lote_id: loteId, organizacion_id: lote!.organizacion_id, evaluacion_id, hallazgo: hallazgo || null, cambio_orden_visitas: cambio, creado_por: user?.id });
    if (error) return setMsg(error.message);
    if (tipoEvento) await sb.from('eventos_manejo').insert({ lote_id: loteId, organizacion_id: lote!.organizacion_id, fecha: new Date().toISOString().slice(0, 10), tipo: tipoEvento, notas: hallazgo || null, creado_por: user?.id });
    setAbierto(false); setHallazgo(''); setCambio(null); setTipoEvento(''); r.refresh();
  }
  if (!abierto) return <button className="btn-secundario mt-3 !py-1.5" onClick={() => setAbierto(true)}>Marcar visitada · qué encontré</button>;
  return (
    <form onSubmit={guardar} className="mt-3 space-y-2">
      <textarea className="campo" rows={3} placeholder="Qué encontró en el lote…" value={hallazgo} onChange={e => setHallazgo(e.target.value)} />
      <div className="text-sm"><span className="mr-2">¿CultiVista cambió el orden de sus visitas?</span>
        <label className="mr-2"><input type="radio" name="c" checked={cambio === true} onChange={() => setCambio(true)} /> Sí</label><label><input type="radio" name="c" checked={cambio === false} onChange={() => setCambio(false)} /> No</label></div>
      <select className="campo" value={tipoEvento} onChange={e => setTipoEvento(e.target.value)}><option value="">¿Hubo un evento de manejo? (opcional)</option><option value="poda">Poda</option><option value="cosecha">Cosecha</option><option value="renovacion">Renovación</option><option value="siembra">Siembra</option><option value="fertilizacion">Fertilización</option><option value="inundacion">Inundación</option><option value="otro">Otro</option></select>
      {msg && <p className="text-sm text-amber-800">{msg}</p>}
      <div className="flex gap-2"><button className="btn-primario !py-1.5">Guardar</button><button type="button" className="btn-secundario !py-1.5" onClick={() => setAbierto(false)}>Cancelar</button></div>
    </form>
  );
}
