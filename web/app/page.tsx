import Link from 'next/link';
export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-verde">CultiVista · beta</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight">Monitoreo satelital de sus lotes.</h1>
      <p className="mt-4 text-lg text-stone-700">Vea dónde cambió el cultivo y qué revisar en campo, sin esperar la próxima visita. Imágenes Sentinel-2 cada vez que el satélite ve su lote despejado, normalmente 2 a 4 veces al mes.</p>
      <ul className="mt-6 space-y-2 text-stone-700">
        <li>· Dibuje su lote y reciba los últimos 6 meses de observaciones válidas.</li>
        <li>· Lista priorizada de fincas para decidir a cuál ir primero.</li>
        <li>· Recomendaciones con fuente (Cenicafé, Fedecacao, Fedearroz). Si no hay fuente, se lo decimos.</li>
      </ul>
      <p className="mt-6 text-sm text-stone-500">CultiVista señala cambios y zonas que merecen revisión. No diagnostica plagas ni enfermedades ni reemplaza la visita del técnico.</p>
      <div className="mt-8 flex gap-3"><Link href="/auth/login" className="btn-primario">Entrar</Link></div>
    </main>
  );
}
