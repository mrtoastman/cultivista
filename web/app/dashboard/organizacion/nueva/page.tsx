'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
export default function NuevaOrg() {
  const r = useRouter(); const [nombre, setNombre] = useState(''); const [tipo, setTipo] = useState('finca'); const [msg, setMsg] = useState('');
  async function crear(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const { error } = await getSupabase().rpc('crear_organizacion', { p_nombre: nombre, p_tipo: tipo });
    if (error) return setMsg(error.message);
    r.push('/dashboard'); r.refresh();
  }
  return (
    <form onSubmit={crear} className="tarjeta max-w-lg space-y-4">
      <h1 className="text-xl font-bold">Nueva organización</h1>
      <div><label className="etiqueta">Nombre</label><input className="campo" value={nombre} onChange={e => setNombre(e.target.value)} required minLength={2} placeholder="Finca La Esperanza / Cooperativa de Caficultores de…" /></div>
      <div><label className="etiqueta">Tipo</label><select className="campo" value={tipo} onChange={e => setTipo(e.target.value)}><option value="finca">Finca (uno o varios lotes propios)</option><option value="cooperativa">Cooperativa o asociación (muchas fincas)</option></select></div>
      {msg && <p className="text-sm text-amber-800">{msg}</p>}
      <button className="btn-primario">Crear</button>
    </form>
  );
}
