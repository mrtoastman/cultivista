'use client';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
export default function Salir() {
  const r = useRouter();
  return <button className="text-stone-500 underline" onClick={async () => { await getSupabase().auth.signOut(); r.push('/'); r.refresh(); }}>Salir</button>;
}
