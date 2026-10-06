"""Evaluación determinística (diseño §3.7–3.8 + §14.5): nivel por umbrales del cultivo, cambio mediana vs mediana de 3,
recomendaciones trazables a reglas con fuente, candidato de alerta silencioso. rules_version viene del catálogo."""
import statistics as st

def nivel_por_cultivo(ndvi_mediana, cultivo):
    if not cultivo or not cultivo.get("con_fuente"):
        return "sin_regla"
    u = cultivo["umbrales"]
    if ndvi_mediana < u["bajo_max"]: return "bajo"
    if ndvi_mediana <= u["esperado_max"]: return "esperado"
    return "alto"

def cambio_vs_base(ndvi_mediana, medianas_previas):
    """medianas_previas: medianas de observaciones usables anteriores (más reciente primero)."""
    base = medianas_previas[:3]
    if len(base) == 0: return None, 0, "primera observación"
    c = round(ndvi_mediana - st.median(base), 4)
    etiqueta = "comparación preliminar" if len(base) == 1 else ("cambio" if len(base) == 2 else "línea base completa")
    return c, len(base), etiqueta

def recomendaciones(nivel, cultivo):
    if nivel == "sin_regla" or not cultivo:
        return [{"prioridad": "INFO", "texto": "Este cultivo aún no tiene reglas con fuente en CultiVista: se muestra solo el cambio relativo del lote.", "regla_id": None, "fuente": None}]
    orden = {"URGENTE": 0, "ALTA": 1, "MEDIA": 2, "INFO": 3}
    rs = [r for r in cultivo.get("reglas", []) if r.get("nivel") == nivel]
    rs.sort(key=lambda r: orden.get(r.get("prioridad"), 9))
    return [{"prioridad": r["prioridad"], "texto": r["texto"], "regla_id": r["id"], "fuente": r.get("fuente")} for r in rs[:3]]

def evaluar(obs, cultivo, medianas_previas, umbral_alerta=0.10):
    nd = obs["ndvi"]["mediana"]
    nivel = nivel_por_cultivo(nd, cultivo)
    cambio, base_n, etiqueta = cambio_vs_base(nd, medianas_previas)
    return {"nivel": nivel, "cambio": cambio, "base_n": base_n, "etiqueta_cambio": etiqueta,
            "alert_candidate": bool(cambio is not None and base_n >= 2 and cambio <= -umbral_alerta),
            "recomendaciones": recomendaciones(nivel, cultivo),
            "rules_version": (cultivo or {}).get("reglas_version", "sin_regla")}
