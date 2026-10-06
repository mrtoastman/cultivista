"""Interfaz ProveedorImagenes (diseño §3.1). Implementación 1: Earth Search (AWS, sin credenciales).
Los COG de la colección sentinel-2-l2a ya traen el BOA_ADD_OFFSET aplicado (verificado 6-oct-2026 contra el JP2 original: DN_cog = DN_jp2 − 1000)."""
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable
import rasterio
from rasterio.windows import from_bounds, Window
from pystac_client import Client
from shapely.geometry import mapping

BANDAS = {"blue": "B02", "green": "B03", "red": "B04", "rededge1": "B05", "nir": "B08", "nir08": "B8A", "swir16": "B11", "scl": "SCL"}

@dataclass
class Escena:
    proveedor: str
    item_id: str
    tile: str | None
    acquired_at: datetime
    provider_published_at: datetime | None
    epsg: int | None
    processing_baseline: str | None
    nube_escena: float | None
    assets: dict  # nombre lógico → href

class EarthSearch:
    nombre = "earth-search"
    URL = "https://earth-search.aws.element84.com/v1"
    COLECCION = "sentinel-2-l2a"

    def __init__(self):
        self._cat = Client.open(self.URL)

    def buscar_escenas(self, poligono, desde: str, hasta: str) -> list[Escena]:
        s = self._cat.search(collections=[self.COLECCION], intersects=mapping(poligono), datetime=f"{desde}/{hasta}",
                             sortby=[{"field": "properties.datetime", "direction": "asc"}])
        out = []
        for it in s.items():
            p = it.properties
            def f(k):
                v = p.get(k); return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None
            out.append(Escena(self.nombre, it.id, p.get("grid:code") or p.get("s2:tile_id"), f("datetime"), f("created"),
                              p.get("proj:epsg") or (p.get("proj:code") or "EPSG:0").split(":")[-1] and int((p.get("proj:code") or "EPSG:0").split(":")[-1]) or None,
                              p.get("s2:processing_baseline"), p.get("eo:cloud_cover"),
                              {k: it.assets[k].href for k in BANDAS if k in it.assets}))
        return out

    @staticmethod
    def leer_banda(escena: Escena, banda: str, bounds_crs_destino, crs_destino=None):
        """Lee la ventana que cubre `bounds` (en el CRS del raster). Devuelve (array float, transform, crs)."""
        with rasterio.open(escena.assets[banda]) as src:
            w = from_bounds(*bounds_crs_destino, transform=src.transform).round_offsets().round_lengths()
            # ampliar 1 píxel para que la rasterización del polígono no pierda borde
            w = Window(w.col_off - 1, w.row_off - 1, w.width + 2, w.height + 2)
            arr = src.read(1, window=w, boundless=True, fill_value=0)
            return arr, src.window_transform(w), src.crs
