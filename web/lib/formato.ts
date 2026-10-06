export const NIVEL: Record<string, { texto: string; color: string }> = {
  bajo: { texto: 'Bajo según regla', color: 'bg-amber-100 text-amber-900' },
  esperado: { texto: 'En rango esperado', color: 'bg-emerald-100 text-emerald-900' },
  alto: { texto: 'Alto según regla', color: 'bg-sky-100 text-sky-900' },
  sin_regla: { texto: 'Sin regla con fuente', color: 'bg-stone-200 text-stone-700' },
};
export function diasDesde(fecha: string | null | undefined) {
  if (!fecha) return null;
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}
export function fmtFecha(f: string | null | undefined) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function fmtCambio(c: number | null | undefined) {
  if (c === null || c === undefined) return '—';
  const s = c > 0 ? '+' : '';
  return `${s}${c.toFixed(2)}`;
}
export function accionSugerida(cambio: number | null, dias: number | null, nivel: string | null): { texto: string; peso: number } {
  if (dias === null) return { texto: 'Sin observación aún', peso: 50 };
  if (dias > 21) return { texto: `Sin imagen válida hace ${dias} días (nubes)`, peso: 30 + Math.min(dias, 60) / 2 };
  if (cambio !== null && cambio <= -0.1) return { texto: 'Cambio marcado: revisar en campo', peso: 100 + Math.abs(cambio) * 100 };
  if (cambio !== null && cambio <= -0.05) return { texto: 'Cambio leve: observar', peso: 60 };
  if (nivel === 'bajo') return { texto: 'Índice bajo según regla', peso: 55 };
  return { texto: 'Sin cambios relevantes', peso: 0 };
}
