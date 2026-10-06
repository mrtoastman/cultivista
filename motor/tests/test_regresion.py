"""Pruebas de regresión del motor. Requieren red (Earth Search). Fixture 1 reproduce la ventana del prototipo viejo."""
import numpy as np, pytest, rasterio
from rasterio.windows import Window
from pyproj import Transformer
from shapely.geometry import Polygon
from cultivista_motor import indices as I, mascara as M
from cultivista_motor.proveedor import EarthSearch
from cultivista_motor.analisis import analizar_lote

LAT, LON = 3.9214, -76.4438  # finca de prueba (Buga)
POLI_4HA = Polygon([(LON-0.0009, LAT-0.0009), (LON+0.0009, LAT-0.0009), (LON+0.0009, LAT+0.0009), (LON-0.0009, LAT+0.0009)])

@pytest.fixture(scope="module")
def prov(): return EarthSearch()

@pytest.fixture(scope="module")
def escena_abr(prov):
    e = [x for x in prov.buscar_escenas(POLI_4HA, "2026-04-20", "2026-04-20") if "18NUK" in x.item_id]
    assert e, "escena 20-abr-2026 no encontrada"; return e[0]

def test_fixture_buga_ventana_50x50(escena_abr):
    """Caso congelado 6-oct-2026: ventana 50×50 centrada en el punto, NDVI medio sin máscara = 0,486 (viejo prototipo daba 0,319 por no restar el offset)."""
    with rasterio.open(escena_abr.assets["red"]) as s4, rasterio.open(escena_abr.assets["nir"]) as s8:
        x, y = Transformer.from_crs("EPSG:4326", s4.crs, always_xy=True).transform(LON, LAT)
        r, c = s4.index(x, y); w = Window(c-25, r-25, 50, 50)
        b4 = s4.read(1, window=w).astype(float); b8 = s8.read(1, window=w).astype(float)
    assert (r, c) == (6646, 3969)
    assert abs(float(np.nanmean(I.ndvi(b4, b8))) - 0.486) < 0.001

def test_escena_nublada_no_es_usable(prov, escena_abr):
    """20-abr: el lote de 4 ha tenía la ventana con 65 % nube/sombra → no usable, sin índices."""
    obs = analizar_lote(prov, escena_abr, POLI_4HA)
    assert obs["usable"] is False and "ndvi" not in obs
    assert obs["pct_nube_sombra"] > 50

def test_escena_limpia_calcula_indices(prov):
    """13-ago-2026: 100 % válido en el lote (medido 6-oct) → NDVI mediana en el rango observado 0,45–0,70 y NDMI a 20 m presente."""
    e = [x for x in prov.buscar_escenas(POLI_4HA, "2026-08-13", "2026-08-13") if "18NUK" in x.item_id][0]
    obs = analizar_lote(prov, e, POLI_4HA)
    assert obs["usable"] and obs["pct_indice_valido"] >= 95
    assert 0.45 <= obs["ndvi"]["mediana"] <= 0.70
    assert obs["ndmi_20m"]["n"] > 0 and obs["n_px_indice"] >= 4 * obs["n_px_scl"] * 0.8

def test_agua_fuera_del_indice():
    scl = np.array([[4, 6], [5, 3]]); dentro = np.ones((2, 2), bool)
    s = M.estadisticas_scl(scl, dentro)
    assert s["pct_indice_valido"] == 50.0 and s["pct_clasificado"] == 75.0 and s["pct_agua"] == 25.0
    assert M.es_usable(s, 60, 1)[0] is False

def test_umbral_exacto():
    s = {"n_px_scl": 10, "pct_indice_valido": 59.9}; assert M.es_usable(s, 60, 8)[0] is False
    s["pct_indice_valido"] = 60.0; assert M.es_usable(s, 60, 8)[0] is True
