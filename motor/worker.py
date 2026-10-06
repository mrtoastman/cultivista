"""Worker de CultiVista (diseño §4): consume la tabla `trabajos` y ejecuta el pipeline del motor.
Uso: python worker.py [--una-vez] [--intervalo 30]. Conexión directa a Postgres (pooler) con el .env de Produccion."""
import os, sys, json, time, socket, traceback
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
import psycopg
from psycopg.types.json import Jsonb
from shapely.geometry import shape
from cultivista_motor import VERSIONES
from cultivista_motor.proveedor import EarthSearch
from cultivista_motor.analisis import analizar_lote
from cultivista_motor.evaluacion import evaluar

ENV = Path.home() / "Library/Application Support/Optimus/Produccion/CULTIVISTA/.env"
def cargar_env():
    e = {}
    for l in ENV.read_text().splitlines():
        if "=" in l and not l.startswith("#"):
            k, v = l.split("=", 1); e[k.strip()] = v.strip()
    return e
def conectar(env):
    return psycopg.connect(host="aws-0-sa-east-1.pooler.supabase.com", port=5432, user=f"postgres.{env['SUPABASE_PROJECT_REF']}",
                           password=env["SUPABASE_DB_PASSWORD"], dbname="postgres", sslmode="require", autocommit=True)

WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"

def tomar_trabajo(cx):
    return cx.execute("""
      update trabajos set estado='procesando', locked_at=now(), worker_id=%s, iniciado=now(), intentos=intentos+1
      where id = (select id from trabajos where estado in ('pendiente','fallido') and intentos < 3
                  and (next_retry_at is null or next_retry_at < now()) order by creado for update skip locked limit 1)
      returning id, tipo, lote_id, escena_id, processing_version, intentos""", (WORKER_ID,)).fetchone()

def upsert_escena(cx, e):
    return cx.execute("""insert into escenas (proveedor,item_id,tile,acquired_at,provider_published_at,epsg,processing_baseline,nube_escena)
      values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict (proveedor,item_id) do update set nube_escena=excluded.nube_escena returning id""",
      (e.proveedor, e.item_id, e.tile, e.acquired_at, e.provider_published_at, e.epsg, e.processing_baseline, e.nube_escena)).fetchone()[0]

def guardar_observacion(cx, lote_id, org_id, escena_db_id, obs):
    nd = obs.get("ndvi", {}); nm = obs.get("ndmi_20m", {})
    r = cx.execute("""insert into observaciones (lote_id,organizacion_id,escena_id,usable,pct_clasificado,pct_indice_valido,pct_vegetacion,pct_suelo,pct_agua,pct_nube_sombra,
        n_px_scl,n_px_indice,scl_stats,ndvi_media,ndvi_mediana,ndvi_p10,ndvi_p90,ndvi_std,ndmi_mediana,otros_indices,processing_version,mask_version,algorithm_version)
      values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
      on conflict (lote_id,escena_id,processing_version) do nothing returning id""",
      (lote_id, org_id, escena_db_id, obs["usable"], obs.get("pct_clasificado"), obs.get("pct_indice_valido"), obs.get("pct_vegetacion"), obs.get("pct_suelo"),
       obs.get("pct_agua"), obs.get("pct_nube_sombra"), obs.get("n_px_scl"), obs.get("n_px_indice"), Jsonb({"clases": obs.get("clases"), "motivo": obs.get("motivo")}),
       nd.get("media"), nd.get("mediana"), nd.get("p10"), nd.get("p90"), nd.get("std"), nm.get("mediana"), Jsonb(obs.get("laboratorio")),
       obs["processing_version"], obs["mask_version"], obs["algorithm_version"])).fetchone()
    return r[0] if r else None

def evaluar_y_guardar(cx, lote_id, org_id, obs_id, obs, cultivo, acquired_at):
    prev = cx.execute("""select o.id, o.ndvi_mediana from observaciones o join escenas e on e.id=o.escena_id
        where o.lote_id=%s and o.usable and o.id<>%s and e.acquired_at < %s order by e.acquired_at desc limit 3""", (lote_id, obs_id, acquired_at)).fetchall()
    cfg = cx.execute("select valor from config_sistema where clave='alerta_caida_ndvi'").fetchone()[0]
    ev = evaluar(obs, cultivo, [float(p[1]) for p in prev], umbral_alerta=cfg.get("umbral", 0.10))
    cx.execute("""insert into evaluaciones (observacion_id,lote_id,organizacion_id,nivel,cambio,base_n,baseline_ids,alert_candidate,recomendaciones,rules_version)
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", (obs_id, lote_id, org_id, ev["nivel"], ev["cambio"], ev["base_n"], [p[0] for p in prev], ev["alert_candidate"], Jsonb(ev["recomendaciones"]), ev["rules_version"]))
    if ev["alert_candidate"]:
        cx.execute("insert into alertas (lote_id,organizacion_id,evaluacion_id,tipo,estado,motivo) select %s,%s,id,'caida_ndvi','candidata','registro silencioso (flag apagado)' from evaluaciones where observacion_id=%s", (lote_id, org_id, obs_id))
    return ev

def procesar_lote(cx, prov, lote_id, desde, hasta, log):
    lote = cx.execute("""select l.id, l.organizacion_id, st_asgeojson(l.geom)::json, l.nombre, c.id, c.umbrales, c.reglas, c.fuentes, c.reglas_version, c.con_fuente
        from lotes l left join cultivos c on c.id=l.cultivo_id where l.id=%s""", (lote_id,)).fetchone()
    if not lote: raise RuntimeError("lote inexistente")
    _, org_id, gj, nombre, cid, umb, reglas, fuentes, rv, cf = lote
    cultivo = {"id": cid, "umbrales": umb, "reglas": reglas, "fuentes": fuentes, "reglas_version": rv, "con_fuente": cf} if cid else None
    poli = shape(gj)
    etapa = "stac"
    escenas = prov.buscar_escenas(poli, desde.isoformat(), hasta.isoformat())
    log(f"lote {nombre}: {len(escenas)} escenas {desde}→{hasta}")
    usables = 0
    for e in escenas:
        etapa = f"cog:{e.item_id}"
        obs = analizar_lote(prov, e, poli)
        esc_id = upsert_escena(cx, e)
        obs_id = guardar_observacion(cx, lote_id, org_id, esc_id, obs)
        if obs_id and obs["usable"]:
            usables += 1
            ev = evaluar_y_guardar(cx, lote_id, org_id, obs_id, obs, cultivo, e.acquired_at)
            log(f"  {e.acquired_at.date()} usable ndvi_med={obs['ndvi']['mediana']} nivel={ev['nivel']} cambio={ev['cambio']} ({ev['etiqueta_cambio']})")
        elif obs_id:
            log(f"  {e.acquired_at.date()} no usable: {obs['motivo']}")
    return {"escenas": len(escenas), "usables": usables}, etapa

def ejecutar(cx, prov, t, log):
    tid, tipo, lote_id, escena_id, pv, intentos = t
    etapa = "inicio"
    try:
        hoy = date.today()
        if tipo == "historico_6m":
            res, etapa = procesar_lote(cx, prov, lote_id, hoy - timedelta(days=183), hoy, log)
        elif tipo == "observacion_nueva":
            ult = cx.execute("select max(e.acquired_at) from observaciones o join escenas e on e.id=o.escena_id where o.lote_id=%s", (lote_id,)).fetchone()[0]
            desde = (ult.date() + timedelta(days=1)) if ult else hoy - timedelta(days=183)
            res, etapa = procesar_lote(cx, prov, lote_id, desde, hoy, log)
        else:
            raise RuntimeError(f"tipo no implementado: {tipo}")
        cx.execute("update trabajos set estado='listo', terminado=now(), error=%s, locked_at=null where id=%s", (json.dumps(res), tid))
        log(f"trabajo {tid} listo {res}")
    except Exception as ex:
        espera = 2 ** intentos * 60
        cx.execute("update trabajos set estado='fallido', etapa_fallida=%s, error=%s, next_retry_at=now()+(%s||' seconds')::interval, locked_at=null where id=%s",
                   (etapa, f"{type(ex).__name__}: {ex}"[:500], str(espera), tid))
        log(f"trabajo {tid} FALLÓ en {etapa}: {ex}\n{traceback.format_exc()[-800:]}")

def main():
    una_vez = "--una-vez" in sys.argv
    intervalo = int(sys.argv[sys.argv.index("--intervalo") + 1]) if "--intervalo" in sys.argv else 30
    env = cargar_env(); prov = EarthSearch()
    log = lambda m: print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {m}", flush=True)
    log(f"worker {WORKER_ID} iniciado ({'una vez' if una_vez else f'cada {intervalo} s'})")
    while True:
        with conectar(env) as cx:
            t = tomar_trabajo(cx)
            while t:
                ejecutar(cx, prov, t, log); t = tomar_trabajo(cx)
        if una_vez: break
        time.sleep(intervalo)

if __name__ == "__main__":
    main()
