"""Análisis de un lote sobre una escena: lectura por ventana → máscara → índices → estadísticas (diseño §3)."""
from pyproj import Transformer
from shapely.ops import transform as shp_transform
import numpy as np
from . import VERSIONES, mascara as M, indices as I
from .proveedor import EarthSearch, Escena

def analizar_lote(prov: EarthSearch, escena: Escena, poligono_wgs84, umbral_pct=60.0, min_px_scl=8, laboratorio=True):
    # 1) SCL (20 m) y máscara del lote
    with __import__("rasterio").open(escena.assets["scl"]) as s:
        crs = s.crs
    tr = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    p_utm = shp_transform(tr.transform, poligono_wgs84)
    scl, t20, _ = prov.leer_banda(escena, "scl", p_utm.bounds)
    dentro20 = M.mascara_lote(p_utm, scl.shape, t20)
    stats = M.estadisticas_scl(scl, dentro20)
    usable, motivo = M.es_usable(stats, umbral_pct, min_px_scl)
    obs = {"escena": escena.item_id, "fecha": escena.acquired_at.date().isoformat(), "usable": usable, "motivo": motivo, **stats, **VERSIONES}
    if not usable:
        return obs
    # 2) bandas 10 m
    red, t10, _ = prov.leer_banda(escena, "red", p_utm.bounds)
    nir, _, _ = prov.leer_banda(escena, "nir", p_utm.bounds)
    dentro10 = M.mascara_lote(p_utm, red.shape, t10)
    # validez 20 m → 10 m alineada por transform (misma esquina superior izquierda, factor 2)
    valid10 = _alinear_validez(scl, t20, red.shape, t10)
    ok10 = dentro10 & valid10 & (red > 0) & (nir > 0)
    obs["n_px_indice"] = int(ok10.sum())
    obs["ndvi"] = I.resumen(I.ndvi(red.astype(float), nir.astype(float)), ok10)
    # 3) NDMI a 20 m
    if "swir16" in escena.assets:
        swir, _, _ = prov.leer_banda(escena, "swir16", p_utm.bounds)
        ok20 = dentro20 & np.isin(scl, M.CLASES_INDICE)
        nd = I.ndmi_20m(nir.astype(float), swir.astype(float))
        h, w = min(nd.shape[0], ok20.shape[0]), min(nd.shape[1], ok20.shape[1])
        obs["ndmi_20m"] = I.resumen(nd[:h, :w], ok20[:h, :w])
    if laboratorio:
        green, _, _ = prov.leer_banda(escena, "green", p_utm.bounds)
        blue, _, _ = prov.leer_banda(escena, "blue", p_utm.bounds)
        r, n, g, b = (x.astype(float) for x in (red, nir, green, blue))
        obs["laboratorio"] = {"gndvi": I.resumen(I.gndvi(g, n), ok10)["mediana"] if ok10.any() else None,
                              "evi": I.resumen(I.evi(b, r, n), ok10)["mediana"] if ok10.any() else None,
                              "msavi": I.resumen(I.msavi(r, n), ok10)["mediana"] if ok10.any() else None}
    return obs

def _alinear_validez(scl, t20, shape10, t10):
    """Mapea cada píxel de 10 m a su píxel SCL de 20 m por coordenadas (vecino más cercano)."""
    rows = np.arange(shape10[0]); cols = np.arange(shape10[1])
    xs = t10.c + (cols + 0.5) * t10.a; ys = t10.f + (rows + 0.5) * t10.e
    c20 = np.floor((xs - t20.c) / t20.a).astype(int); r20 = np.floor((ys - t20.f) / t20.e).astype(int)
    c20 = np.clip(c20, 0, scl.shape[1] - 1); r20 = np.clip(r20, 0, scl.shape[0] - 1)
    v20 = np.isin(scl, M.CLASES_INDICE)
    return v20[r20[:, None], c20[None, :]]
