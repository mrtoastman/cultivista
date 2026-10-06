"""Índices (indices_v1). Reflectancia = DN * 1e-4 (offset ya aplicado en los COG de Earth Search).
NDVI a 10 m. NDMI y NDRE en grilla nativa de 20 m (§14.4): B08 agregado a 20 m por media de 2×2."""
import numpy as np

def _norm(a, b):
    with np.errstate(divide="ignore", invalid="ignore"):
        r = (a - b) / (a + b)
    return np.where((a + b) > 0, r, np.nan)

def ndvi(red, nir): return _norm(nir, red)
def gndvi(green, nir): return _norm(nir, green)
def evi(blue, red, nir):
    b, r, n = blue * 1e-4, red * 1e-4, nir * 1e-4
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.clip(2.5 * (n - r) / (n + 6 * r - 7.5 * b + 1), -1, 1)
def msavi(red, nir):
    r, n = red * 1e-4, nir * 1e-4
    return (2 * n + 1 - np.sqrt(np.maximum((2 * n + 1) ** 2 - 8 * (n - r), 0))) / 2

def a_20m(arr10):
    """Agrega 10 m → 20 m por media de bloques 2×2 (recorta a par)."""
    h, w = arr10.shape[0] // 2 * 2, arr10.shape[1] // 2 * 2
    a = arr10[:h, :w].astype(float)
    return a.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))

def ndmi_20m(nir10, swir16_20):
    n = a_20m(nir10); s = swir16_20[:n.shape[0], :n.shape[1]]
    return _norm(n[:s.shape[0], :s.shape[1]], s)
def ndre_20m(nir10, rededge1_20):
    n = a_20m(nir10); e = rededge1_20[:n.shape[0], :n.shape[1]]
    return _norm(n[:e.shape[0], :e.shape[1]], e)

def resumen(arr, mask):
    v = arr[mask & np.isfinite(arr)]
    if v.size == 0:
        return {"n": 0}
    return {"n": int(v.size), "media": round(float(v.mean()), 4), "mediana": round(float(np.median(v)), 4),
            "p10": round(float(np.percentile(v, 10)), 4), "p90": round(float(np.percentile(v, 90)), 4), "std": round(float(v.std()), 4)}
