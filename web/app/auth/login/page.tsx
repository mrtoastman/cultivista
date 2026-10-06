'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
export default function Login() {
  const r = useRouter(); const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [msg, setMsg] = useState(''); const [cargando, setCargando] = useState(false);
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setCargando(true);
    const sb = getSupabase();
    const res = modo === 'entrar' ? await sb.auth.signInWithPassword({ email, password: pass }) : await sb.auth.signUp({ email, password: pass });
    setCargando(false);
    if (res.error) return setMsg(res.error.message);
    if (modo === 'crear' && !res.data.session) return setMsg('Cuenta creada. Revise su correo para confirmarla y luego entre.');
    r.push('/dashboard'); r.refresh();
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">{modo === 'entrar' ? 'Entrar a CultiVista' : 'Crear cuenta'}</h1>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        <div><label className="etiqueta">Correo</label><input className="campo" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></div>
        <div><label className="etiqueta">Contraseña</label><input className="campo" type="password" value={pass} onChange={e => setPass(e.target.value)} required minLength={8} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} /></div>
        {msg && <p className="text-sm text-amber-800">{msg}</p>}
        <button className="btn-primario w-full" disabled={cargando}>{cargando ? '…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
      </form>
      <button className="mt-4 text-sm text-verde underline" onClick={() => setModo(modo === 'entrar' ? 'crear' : 'entrar')}>{modo === 'entrar' ? '¿No tiene cuenta? Crear una' : 'Ya tengo cuenta'}</button>
    </main>
  );
}
