// 30 lotes de calibración · centro y norte del Valle del Cauca (decisión JD 6-oct-2026).
// [S] Muestras ANÓNIMAS: cuadrados de ~4 ha (200 m) sobre zonas agrícolas típicas de cada municipio, ubicación aproximada,
// sin verificación de campo. Sirven para calibrar máscara/umbrales, no para afirmar nada sobre una finca real.
import pg from 'pg'; import { readFileSync } from 'node:fs'; import { homedir } from 'node:os';
const env = Object.fromEntries(readFileSync(`${homedir()}/Library/Application Support/Optimus/Produccion/CULTIVISTA/.env`,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const LOTES = [
  // caña · valle plano (zona Cenicaña)
  ['Palmira',       'cana',     3.5120, -76.3450], ['Palmira',       'cana',     3.5600, -76.2500],
  ['El Cerrito',    'cana',     3.6700, -76.3350], ['Ginebra',       'cana',     3.7150, -76.2950],
  ['Guacarí',       'cana',     3.7650, -76.3500], ['Buga',          'cana',     3.8800, -76.3400],
  ['Buga',          'cana',     3.9400, -76.3650], ['San Pedro',     'cana',     3.9900, -76.2900],
  ['Tuluá',         'cana',     4.0600, -76.2350], ['Andalucía',     'cana',     4.1600, -76.2000],
  ['Bugalagrande',  'cana',     4.2250, -76.1950], ['Zarzal',        'cana',     4.3700, -76.1000],
  ['La Paila',      'cana',     4.3100, -76.0600], ['Roldanillo',    'cana',     4.4000, -76.1100],
  // café · piedemonte y cordillera (centro y norte)
  ['Sevilla',       'cafe',     4.2650, -75.9450], ['Sevilla',       'cafe',     4.2950, -75.9150],
  ['Caicedonia',    'cafe',     4.3250, -75.8400], ['Trujillo',      'cafe',     4.2050, -76.3350],
  ['Riofrío',       'cafe',     4.1500, -76.3050], ['Restrepo',      'cafe',     3.8150, -76.5300],
  ['Ginebra (cordillera)', 'cafe', 3.7450, -76.2250], ['Tuluá (cordillera)', 'cafe', 4.0750, -76.1200],
  // frutales · norte (cítricos, aguacate, plátano, otros)
  ['Roldanillo',    'citricos', 4.4350, -76.1550], ['La Unión',      'frutales', 4.5250, -76.0950],
  ['Toro',          'citricos', 4.6100, -76.0700], ['Bolívar',       'frutales', 4.3400, -76.1750],
  ['Trujillo (ladera)', 'aguacate', 4.2300, -76.3050], ['Sevilla (ladera)', 'aguacate', 4.2400, -75.9800],
  ['Andalucía (ladera)', 'platano', 4.1800, -76.1450], ['Restrepo (frutales)', 'frutales', 3.8372, -76.5003],
];
const c=new pg.Client({host:'aws-0-sa-east-1.pooler.supabase.com', port:5432, user:`postgres.${env.SUPABASE_PROJECT_REF}`, password:env.SUPABASE_DB_PASSWORD, database:'postgres', ssl:{rejectUnauthorized:false}}); await c.connect();
const org=(await c.query("select id from organizaciones where nombre='CultiVista Lab'")).rows[0];
const d=0.0009; let n=0;
for (const [mun, cultivo, lat, lon] of LOTES) {
  const nombreF=`Calibración ${mun}`;
  let f=(await c.query("select id from fincas where organizacion_id=$1 and nombre=$2",[org.id,nombreF])).rows[0];
  if(!f) f=(await c.query("insert into fincas (organizacion_id,nombre,municipio,departamento,notas) values ($1,$2,$3,'Valle del Cauca','[S] muestra anónima aproximada, sin verificación de campo') returning id",[org.id,nombreF,mun.replace(/ \(.*\)/,'')])).rows[0];
  const nombreL=`${cultivo} ${lat.toFixed(4)},${lon.toFixed(4)}`;
  let l=(await c.query("select id from lotes where finca_id=$1 and nombre=$2",[f.id,nombreL])).rows[0];
  if(!l){ const poli={type:'Polygon',coordinates:[[[lon-d,lat-d],[lon+d,lat-d],[lon+d,lat+d],[lon-d,lat+d],[lon-d,lat-d]]]};
    l=(await c.query("insert into lotes (finca_id,organizacion_id,nombre,cultivo_id,geom) values ($1,$2,$3,$4,st_geomfromgeojson($5)) returning id",[f.id,org.id,nombreL,cultivo,JSON.stringify(poli)])).rows[0]; n++; }
  await c.query("insert into trabajos (tipo,lote_id,processing_version) values ('historico_6m',$1,'proc_v1') on conflict do nothing",[l.id]);
}
console.log('lotes nuevos', n, '| total lotes', (await c.query("select count(*) from lotes")).rows[0].count, '| trabajos pendientes', (await c.query("select count(*) from trabajos where estado='pendiente'")).rows[0].count);
await c.end();
