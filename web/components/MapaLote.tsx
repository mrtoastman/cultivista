'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type Punto = [number, number];
const ESTILO: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri World Imagery' },
    calles: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
    // Límites administrativos, nombres de municipios, veredas, ríos y vías, dibujados encima del satélite
    referencia: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri Boundaries & Places' },
    transporte: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 },
  },
  layers: [
    { id: 'sat', type: 'raster', source: 'sat' },
    { id: 'calles', type: 'raster', source: 'calles', layout: { visibility: 'none' } },
    { id: 'transporte', type: 'raster', source: 'transporte', paint: { 'raster-opacity': 0.8 } },
    { id: 'referencia', type: 'raster', source: 'referencia' },
  ],
};
function areaHa(p: Punto[]) {
  if (p.length < 3) return 0;
  const R = 6371000; const toR = (d: number) => d * Math.PI / 180;
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += toR(x2 - x1) * (2 + Math.sin(toR(y1)) + Math.sin(toR(y2))); }
  return Math.abs(a * R * R / 2) / 10000;
}
export default function MapaLote({ onCambio, poligonoInicial, centro, irA }: { onCambio: (p: Punto[] | null, areaHa: number) => void; poligonoInicial?: Punto[]; centro?: Punto; irA?: Punto | null }) {
  const [base, setBase] = useState<'sat' | 'calles'>('sat'); const [referencia, setReferencia] = useState(true);
  const ref = useRef<HTMLDivElement>(null); const mapa = useRef<maplibregl.Map | null>(null);
  const [puntos, setPuntos] = useState<Punto[]>(poligonoInicial ?? []); const [dibujando, setDibujando] = useState(!poligonoInicial);
  const puntosRef = useRef(puntos); puntosRef.current = puntos; const dibRef = useRef(dibujando); dibRef.current = dibujando;
  useEffect(() => {
    if (!ref.current || mapa.current) return;
    maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs'); // worker ESM servido desde /public (el bundler de Next 16 no lo empaqueta)
    const m = new maplibregl.Map({ container: ref.current, style: ESTILO, center: centro ?? (poligonoInicial?.[0] ?? [-76.30, 4.05]), zoom: poligonoInicial ? 15 : 9, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right');
    m.on('load', () => {
      m.addSource('lote', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'lote-relleno', type: 'fill', source: 'lote', paint: { 'fill-color': '#ffd166', 'fill-opacity': 0.25 } });
      m.addLayer({ id: 'lote-linea', type: 'line', source: 'lote', paint: { 'line-color': '#ffd166', 'line-width': 2.5 } });
      m.addLayer({ id: 'lote-puntos', type: 'circle', source: 'lote', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#1f6b3a', 'circle-stroke-width': 2 } });
      pintar(m, puntosRef.current);
    });
    m.on('click', e => { if (!dibRef.current) return; const p: Punto[] = [...puntosRef.current, [e.lngLat.lng, e.lngLat.lat]]; setPuntos(p); pintar(m, p); onCambio(p.length >= 3 ? p : null, areaHa(p)); });
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function pintar(m: maplibregl.Map, p: Punto[]) {
    const src = m.getSource('lote') as maplibregl.GeoJSONSource | undefined; if (!src) return;
    const feats: GeoJSON.Feature[] = p.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} }));
    if (p.length >= 3) feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...p, p[0]]] }, properties: {} });
    else if (p.length === 2) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} });
    src.setData({ type: 'FeatureCollection', features: feats });
  }
  useEffect(() => { if (irA && mapa.current) mapa.current.flyTo({ center: irA, zoom: 12, duration: 1200 }); }, [irA]);
  useEffect(() => { const m = mapa.current; if (!m || !m.isStyleLoaded()) return; m.setLayoutProperty('sat', 'visibility', base === 'sat' ? 'visible' : 'none'); m.setLayoutProperty('calles', 'visibility', base === 'calles' ? 'visible' : 'none'); }, [base]);
  useEffect(() => { const m = mapa.current; if (!m || !m.isStyleLoaded()) return; for (const id of ['referencia', 'transporte']) m.setLayoutProperty(id, 'visibility', referencia && base === 'sat' ? 'visible' : 'none'); }, [referencia, base]);
  function deshacer() { const p = puntos.slice(0, -1); setPuntos(p); if (mapa.current) pintar(mapa.current, p); onCambio(p.length >= 3 ? p : null, areaHa(p)); }
  function limpiar() { setPuntos([]); setDibujando(true); if (mapa.current) pintar(mapa.current, []); onCambio(null, 0); }
  return (
    <div>
      <div className="relative">
        <div ref={ref} className="h-[60vh] min-h-[320px] w-full rounded-lg border border-borde" />
        <div className="absolute left-2 top-2 flex gap-1 rounded-md bg-white/90 p-1 text-xs shadow">
          <button type="button" onClick={() => setBase('sat')} className={`rounded px-2 py-1 ${base === 'sat' ? 'bg-verde text-white' : ''}`}>Satélite</button>
          <button type="button" onClick={() => setBase('calles')} className={`rounded px-2 py-1 ${base === 'calles' ? 'bg-verde text-white' : ''}`}>Mapa</button>
          {base === 'sat' && <label className="flex items-center gap-1 px-2 py-1"><input type="checkbox" checked={referencia} onChange={e => setReferencia(e.target.checked)} /> Límites y nombres</label>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-600">{dibujando ? 'Toque el mapa en cada esquina del lote (mínimo 3). ' : 'Lote dibujado. '}{puntos.length >= 3 && <b>{areaHa(puntos).toFixed(2)} ha</b>}</span>
        <button type="button" className="btn-secundario !py-1" onClick={deshacer} disabled={!puntos.length}>Deshacer punto</button>
        <button type="button" className="btn-secundario !py-1" onClick={limpiar} disabled={!puntos.length}>Empezar de nuevo</button>
        {puntos.length >= 3 && dibujando && <button type="button" className="btn-secundario !py-1" onClick={() => setDibujando(false)}>Cerrar polígono</button>}
      </div>
    </div>
  );
}
