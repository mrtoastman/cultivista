export default function Serie({ datos }: { datos: { fecha: string; ndvi: number; ndmi: number | null }[] }) {
  const W = 640, H = 200, px = 36, py = 16;
  const xs = datos.map(d => new Date(d.fecha).getTime()); const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (t: number) => px + (x1 === x0 ? 0 : (t - x0) / (x1 - x0)) * (W - 2 * px);
  const y = (v: number) => py + (1 - (Math.max(-0.2, Math.min(1, v)) + 0.2) / 1.2) * (H - 2 * py);
  const ruta = (k: 'ndvi' | 'ndmi') => datos.filter(d => d[k] != null).map((d, i) => `${i ? 'L' : 'M'}${X(new Date(d.fecha).getTime()).toFixed(1)},${y(d[k] as number).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Serie de NDVI y NDMI">
      {[0, 0.2, 0.4, 0.6, 0.8].map(v => <g key={v}><line x1={px} x2={W - px} y1={y(v)} y2={y(v)} stroke="#e5e2d8" /><text x={4} y={y(v) + 4} fontSize="10" fill="#777">{v.toFixed(1)}</text></g>)}
      <path d={ruta('ndmi')} fill="none" stroke="#5b8def" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={ruta('ndvi')} fill="none" stroke="#1f6b3a" strokeWidth="2.5" />
      {datos.map(d => <circle key={d.fecha} cx={X(new Date(d.fecha).getTime())} cy={y(d.ndvi)} r="3.5" fill="#1f6b3a" />)}
      {datos.map((d, i) => (i === 0 || i === datos.length - 1 || datos.length <= 6) && <text key={'t' + d.fecha} x={X(new Date(d.fecha).getTime())} y={H - 2} fontSize="10" textAnchor="middle" fill="#666">{d.fecha.slice(5)}</text>)}
      <text x={W - px} y={12} fontSize="10" textAnchor="end" fill="#1f6b3a">— NDVI</text><text x={W - px - 60} y={12} fontSize="10" textAnchor="end" fill="#5b8def">- - NDMI (20 m)</text>
    </svg>
  );
}
