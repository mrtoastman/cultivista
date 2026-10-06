"""Máscara de calidad SCL (diseño §14.1): tres capas de validez, agua fuera de los índices. mask_v1."""
import numpy as np
from rasterio.features import geometry_mask
from shapely.geometry import mapping

NODATA, SATURADO, OSCURO, SOMBRA, VEGETACION, SUELO, AGUA, SIN_CLASIF, NUBE_MED, NUBE_ALTA, CIRRO, NIEVE = range(12)
CLASES_INDICE = (VEGETACION, SUELO)                 # usable_for_vegetation_index
CLASES_COBERTURA = (VEGETACION, SUELO, AGUA)        # usable_for_coverage
CLASES_NUBE_SOMBRA = (SOMBRA, NUBE_MED, NUBE_ALTA, CIRRO)

def mascara_lote(poligono_utm, shape, transform):
    """True dentro del polígono (rasterización por centro de píxel; sin erosión de borde, §14.2)."""
    return geometry_mask([mapping(poligono_utm)], out_shape=shape, transform=transform, invert=True)

def estadisticas_scl(scl, dentro):
    s = scl[dentro]
    n = int(s.size)
    if n == 0:
        return {"n_px_scl": 0}
    pct = lambda clases: round(float(np.isin(s, clases).mean() * 100), 1)
    return {
        "n_px_scl": n,
        "pct_clasificado": pct(CLASES_COBERTURA),
        "pct_indice_valido": pct(CLASES_INDICE),
        "pct_vegetacion": pct((VEGETACION,)), "pct_suelo": pct((SUELO,)), "pct_agua": pct((AGUA,)),
        "pct_nube_sombra": pct(CLASES_NUBE_SOMBRA),
        "pct_nodata": pct((NODATA,)),
        "clases": {int(k): int(v) for k, v in zip(*np.unique(s, return_counts=True))},
    }

def valido_para_indice_10m(scl20, shape10):
    """Expande la validez de 20 m a la grilla de 10 m por vecino más cercano (categórica)."""
    v20 = np.isin(scl20, CLASES_INDICE)
    v10 = np.kron(v20, np.ones((2, 2), dtype=bool))
    return v10[:shape10[0], :shape10[1]]

def es_usable(stats, umbral_pct=60.0, min_px_scl=8):
    """Default de software [S], a calibrar con 30 lotes (§14.3). Se calibra sobre píxeles SCL de 20 m."""
    if stats.get("n_px_scl", 0) < min_px_scl:
        return False, "lote demasiado pequeño para la máscara"
    if stats["pct_indice_valido"] < umbral_pct:
        return False, f"solo {stats['pct_indice_valido']} % del lote con píxel válido para índice"
    return True, "ok"
