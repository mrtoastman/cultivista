// Descarga DIVIPOLA (DANE, datos.gov.co, dataset gdxc-w37w) → lib/datos/municipios.json
// Campos: código DANE (5 dígitos), municipio, departamento, lat, lon. Se corre a mano cuando el DANE actualice.
import { writeFileSync } from 'node:fs';
const url = 'https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000&$select=cod_mpio,nom_mpio,dpto,latitud,longitud';
const filas = await (await fetch(url)).json();
const n = (s) => parseFloat(String(s).replace(',', '.'));
const titulo = (s) => s.toLowerCase().replace(/(^|\s|\()([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bDe\b/g, 'de').replace(/\bDel\b/g, 'del').replace(/\bLa\b/g, 'la').replace(/\bY\b/g, 'y').replace(/^(la|de|del) /i, m => m.charAt(0).toUpperCase() + m.slice(1));
const lista = filas.map(f => ({ c: f.cod_mpio, m: titulo(f.nom_mpio), d: titulo(f.dpto), lat: +n(f.latitud).toFixed(5), lon: +n(f.longitud).toFixed(5) }))
  .filter(f => f.c && Number.isFinite(f.lat) && Number.isFinite(f.lon)).sort((a, b) => a.d.localeCompare(b.d, 'es') || a.m.localeCompare(b.m, 'es'));
writeFileSync('lib/datos/municipios.json', JSON.stringify({ fuente: 'DANE · DIVIPOLA (datos.gov.co gdxc-w37w)', actualizado: new Date().toISOString().slice(0, 10), municipios: lista }));
console.log(lista.length, 'municipios;', lista.filter(x => x.d === 'Valle del Cauca').length, 'en Valle del Cauca; ejemplo', lista.find(x => x.m === 'Tuluá'));
