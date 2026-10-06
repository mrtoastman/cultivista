'use client';
import { useMemo, useState } from 'react';
import datos from '@/lib/datos/municipios.json';
export type Municipio = { c: string; m: string; d: string; lat: number; lon: number };
const TODOS = (datos as { municipios: Municipio[] }).municipios;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export default function SelectorMunicipio({ valor, onCambio, departamentoPreferido = 'Valle del Cauca' }: { valor: Municipio | null; onCambio: (m: Municipio | null) => void; departamentoPreferido?: string }) {
  const [texto, setTexto] = useState(valor ? `${valor.m}, ${valor.d}` : ''); const [abierto, setAbierto] = useState(false);
  const opciones = useMemo(() => {
    const q = norm(texto.trim()); if (q.length < 2) return [];
    const r = TODOS.filter(x => norm(x.m).includes(q) || norm(`${x.m} ${x.d}`).includes(q));
    r.sort((a, b) => (norm(a.m).startsWith(q) ? 0 : 1) - (norm(b.m).startsWith(q) ? 0 : 1) || (a.d === departamentoPreferido ? 0 : 1) - (b.d === departamentoPreferido ? 0 : 1) || a.m.localeCompare(b.m, 'es'));
    return r.slice(0, 8);
  }, [texto, departamentoPreferido]);
  return (
    <div className="relative">
      <input className="campo" value={texto} placeholder="Escriba el municipio…" autoComplete="off"
        onChange={e => { setTexto(e.target.value); setAbierto(true); if (valor) onCambio(null); }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} />
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-borde bg-white shadow">
          {opciones.map(o => <li key={o.c}><button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-100" onMouseDown={() => { onCambio(o); setTexto(`${o.m}, ${o.d}`); setAbierto(false); }}>{o.m} <span className="text-stone-500">· {o.d} · DANE {o.c}</span></button></li>)}
        </ul>)}
      {texto.length >= 2 && !valor && opciones.length === 0 && <p className="mt-1 text-xs text-stone-500">No aparece en la lista DANE; revise la escritura.</p>}
    </div>
  );
}
