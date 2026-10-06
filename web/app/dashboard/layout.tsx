import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Salir from '@/components/Salir';
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/auth/login');
  const { data: orgs } = await sb.from('organizaciones').select('id,nombre,tipo').order('creada');
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-borde bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-bold text-verde">CultiVista</Link>
          <div className="flex items-center gap-3 text-sm text-stone-600">
            <span className="hidden sm:inline">{orgs?.[0]?.nombre ?? 'Sin organización'}</span>
            <Salir />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
