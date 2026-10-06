# CultiVista v2 · Documento de diseño (etapa 2) · 6-oct-2026

Estado: validado por ChatGPT en etapa 2 (88/100, cambios integrados en §14, que prevalece). Falta visto bueno de JD. Nada construido todavía.
Antecedentes: etapa 1 (arquitectura) validada 84/100 — `00_SISTEMA/chatgpt/entregas/2026-10-06-cultivista-etapa1-arquitectura-CHATGPT-web.md`. Mediciones en `~/Library/Application Support/Optimus/Produccion/CULTIVISTA/2026-10-06-prueba-stac/`.

Etiquetas: **[V]** verificado con datos · **[I]** inferido · **[S]** supuesto por confirmar.

## 0. Objetivo final
Sistema **herramienta + comunidad**, al modelo de Hospedy y MotoFlow: una app web útil desde el primer día, una comunidad propia (página en redes, grupos, tutoriales, datos del sector) que la alimenta, y un agente semanal que mantiene vivo el contenido y el backlog de mejoras.

## 1. Promesa y posicionamiento
- Promesa pública: **«Monitoreo satelital de sus lotes: vea dónde cambió el cultivo y qué revisar en campo, sin esperar la próxima visita.»**
- Nunca: «alerta temprana de plagas», «diagnóstico remoto», «detectamos enfermedades». El mapa señala *comportamiento espectral anómalo o distinto*; la decisión agronómica es de la persona en campo.
- Lo que vende a cada segmento:
  - **Cooperativas / asociaciones (café, cacao):** priorización de visitas. Pantalla principal = lista de fincas ordenada por cambio y por días sin observación válida. Métrica de éxito: el técnico cambia el orden de sus visitas.
  - **Fincas medianas (Valle, Eje Cafetero: caña, frutales, café):** ficha por lote con historial, comparación entre lotes y PDF para el dueño o el agrónomo.

## 2. Hechos medidos que condicionan el diseño [V]
Finca de prueba cerca de Buga, polígono de ~4 ha, tile 18NUK, 33 escenas Sentinel-2 del 4-jun al 2-oct-2026 vía Earth Search (AWS, sin credenciales):
| Medición | Resultado |
|---|---|
| Latencia adquisición → ítem publicado | mediana 7,4 h · p90 10,1 h · máx 12,7 h |
| Escenas con ≥ 50 % de píxeles válidos en el lote | 9 de 33 (27 %) ≈ 2,2 observaciones útiles al mes |
| Brecha máxima sin observación válida | 20 días (24-jun → 14-jul); desde el 19-sep van 17+ días |
| Nube de la escena como predictor del lote | mala: 8-ago 81 % nube de escena / 95,6 % válido en lote; 12-sep 32 % / 0 % |
| Tiempo por escena y lote (lectura SCL + bandas) | p50 3,1 s · p95 10,6 s |
| Píxeles del lote en SCL (20 m) | 90 para 4 ha |
| NDVI del lote (observaciones válidas jun–sep) | 0,45 – 0,67 |

Consecuencias: (1) la selección de escenas se hace por **validez dentro del polígono**, no por nube de la escena; (2) la app debe convivir con semanas sin dato y decirlo; (3) el pipeline cabe en una función corta; (4) «cada 5 días» no se promete, se promete «cada vez que el satélite ve su lote despejado, normalmente 2 a 4 veces al mes» [I].

## 3. Contrato científico del análisis
1. **Proveedor:** interfaz `ProveedorImagenes` con `buscar_escenas(polígono, rango)`, `leer_banda(escena, banda, ventana)`, `metadatos(escena)`. Implementación 1: Earth Search `sentinel-2-l2a` (COG, offset ya aplicado, verificado en `raster:bands`). Implementación 2 (solo si falla la 1): Planetary Computer. Cada observación guarda proveedor, id de ítem, tile, baseline y assets usados.
2. **Área:** polígono obligatorio (dibujado o KML/GeoJSON). Lectura por *bounding box* y máscara por rasterización del polígono. Píxeles de borde: se excluyen los que tocan el límite (erosión de 1 píxel a 10 m) cuando el lote tiene > 200 píxeles; si no, se avisa «lote pequeño: bordes incluidos» [S: validar en campo].
3. **Máscara de calidad (SCL, 20 m → 10 m por vecino más cercano):** inválido = 0 nodata, 1 saturado/defectuoso, 2 oscuro, 3 sombra de nube, 7 no clasificado, 8 nube media, 9 nube alta, 10 cirro, 11 nieve. Válido = 4 vegetación, 5 suelo desnudo, 6 agua (se guarda aparte: si > 20 % del lote es agua se avisa). Versión de máscara: `mask_v1`.
4. **Observación usable:** ≥ 60 % de píxeles válidos dentro del lote **y** ≥ 30 píxeles válidos a 10 m. Si no, la escena se guarda como «no usable» con su porcentaje (nunca se calcula un índice sobre nubes). Umbral configurable por organización; 60 % es punto de partida [S: calibrar con decenas de lotes en café, cacao y arroz].
5. **Índices:** principal **NDVI** (B08, B04). Complementario visible **NDMI** (B08, B11 a 20 m remuestreado) como señal de humedad. Se calculan y guardan también EVI, GNDVI, MSAVI y NDRE (B05) para laboratorio, ocultos en la interfaz. Fórmulas y bandas fijadas en `indices_v1`, con pruebas de regresión: escena 20-abr-2026 / ventana 50×50 de Buga ⇒ NDVI 0,486 ± 0,001.
6. **Estadísticas por observación:** media, mediana, p10, p90, desviación, % válido, % agua, n píxeles, mapa de clases (5 niveles) y PNG del lote.
7. **Niveles por cultivo** (umbrales de NDVI del catálogo, con fuente): café, cacao, arroz al lanzar. Otros cultivos: «sin reglas con fuente: solo se muestra el cambio relativo del lote».
8. **Cambio:** diferencia de la media contra la mediana de las últimas 3 observaciones válidas del mismo lote (mínimo 2). Si no hay base, «primera observación». El cambio es información, no diagnóstico. Alerta automática por correo solo cuando caída ≥ 0,10 de NDVI con observación usable [S].
9. **Primer análisis:** al crear un lote se procesan los últimos 6 meses (todas las escenas; ~33 por semestre ⇒ ~2 min de worker) [V por tiempos medidos].
10. **Versionado:** `processing_version`, `mask_version`, `rules_version` en cada observación y recomendación; nunca se sobrescriben resultados, se recalculan como nueva versión.

## 4. Arquitectura
- **Front:** Next.js (App Router) en Vercel, mismo molde de Hospedy. Mapa MapLibre con base satelital (Esri World Imagery o Mapbox) para dibujar lotes; capa del lote coloreada por clases (PNG georreferenciado o teselas vectoriales simples).
- **Datos:** Supabase: Postgres + PostGIS, Auth, Storage (PNG, PDF), RLS por organización.
- **Motor:** contenedor Python (rasterio, numpy, shapely, pystac-client, fpdf2) con dos modos: `worker` (consume la tabla `trabajos` cada 30 s) y `cron` (lunes y jueves busca escenas nuevas por lote). Alojado en Fly.io o Railway (plan pequeño; ~USD 5/mes) [S]. Alternativa: Vercel Functions en Python para el piloto; se descarta de entrada porque la primera carga de un lote dura ~2 min [I].
- **Cola:** tabla `trabajos` (tipo, lote, estado, intentos, error, versión), idempotente por (lote, escena, processing_version). Reintentos 3 con espera exponencial. Estados: `pendiente → procesando → listo | fallido`.
- **IA redactora:** API de Claude; recibe un JSON cerrado (ver §7) y devuelve texto en lenguaje de campo con secciones fijas. Nunca decide niveles ni recomendaciones: esas salen de reglas determinísticas.
- **Correo:** Resend (mismo proveedor de Hospedy). **WhatsApp:** después.
- **Clima:** Open-Meteo (lluvia y temperatura 30 días, archivo histórico) etiquetado «dato modelado, no estación en la finca». **Suelo (SoilGrids):** fuera del piloto.
- **Observabilidad:** cada trabajo registra etapa fallida (STAC / COG / máscara / índices / PDF / correo); panel interno de trabajos; alerta a JD si > 20 % de fallos en un día.

## 5. Esquema de datos (Supabase)
- `organizaciones` (id, nombre, tipo: cooperativa | finca | demo, plan, umbral_valido, creada)
- `miembros` (organizacion_id, user_id, rol: admin | tecnico | lector)
- `fincas` (id, organizacion_id, nombre, municipio, departamento, contacto_nombre?, notas)
- `lotes` (id, finca_id, nombre, cultivo_id, geom `geometry(Polygon,4326)`, area_ha calculada, fecha_siembra?, activo)
- `cultivos` (id, nombre, categoria, umbrales JSON {optimo_min, optimo_max, estres}, fuentes JSON, reglas_version)
- `escenas` (id, proveedor, item_id, tile, fecha, baseline, nube_escena, created_proveedor)
- `observaciones` (id, lote_id, escena_id, usable bool, pct_valido, pct_agua, n_px, ndvi_media/mediana/p10/p90/std, ndmi_media, otros_indices JSON, mapa_png_path, processing_version, mask_version, creada) UNIQUE(lote_id, escena_id, processing_version)
- `evaluaciones` (id, observacion_id, nivel, cambio_vs_base, base_n, recomendaciones JSON [{prioridad, texto, regla_id, fuente}], rules_version, texto_ia, modelo_ia, pdf_path)
- `trabajos` (id, tipo, lote_id, escena_id?, estado, intentos, error, creado, iniciado, terminado)
- `alertas` (id, lote_id, evaluacion_id, tipo, enviada_a, enviada_en)
- `uso_demo` (huella: ip + cookie, fecha, analisis) — cuota 3 lotes/día por huella y 1 lote por sesión; la demo usa lotes fijos de muestra además del propio.
- RLS: todo filtra por `organizacion_id` vía `miembros`; `cultivos` y `escenas` son públicas de lectura. Prueba obligatoria: dos organizaciones, una no ve nada de la otra.

## 6. Flujos
1. **Registro → organización → primera finca → primer lote** (dibujar polígono o pegar KML; validación: área 0,3–500 ha, polígono simple). Al guardar: trabajo `historico_6m`. Pantalla: «Buscando imágenes de los últimos 6 meses… normalmente 1–3 minutos» con progreso por escena.
2. **Observación nueva (cron):** por lote, buscar escenas desde la última evaluada; procesar; si usable → evaluación → correo resumen semanal (no un correo por escena). Alerta inmediata solo por caída ≥ 0,10 [S].
3. **Informe:** PDF por lote (mapa, serie, cambio, recomendaciones con fuente, clima 30 días, aviso de limitaciones) y PDF por organización (lista priorizada).
4. **Demo pública:** sin registro, 3 lotes de muestra ya procesados (café Huila, cacao Santander, arroz Tolima) + dibujar 1 lote propio con cuota diaria; resultados de la demo caducan a 7 días.
5. **Sin dato:** si un lote lleva > 21 días sin observación usable, la ficha lo dice en grande y explica (nubes). Nunca se muestra el último valor como si fuera actual sin su fecha.

## 7. Contrato con la IA redactora
Entrada JSON: {cultivo, fuentes_disponibles: bool, area_ha, fecha_obs, dias_desde_anterior, pct_valido, ndvi:{media, p10, p90}, ndmi_media, nivel, cambio, base_n, serie_ultimas_6: [...], clima_30d:{lluvia_mm, temp_media}, recomendaciones:[{prioridad, texto, fuente}], limitaciones:[...]}.
Salida: 4 bloques fijos — «Qué se ve», «Qué cambió», «Qué revisar en campo» (reescritura de las recomendaciones, sin agregar ninguna), «Límites de esta lectura». Reglas del sistema: no inventar causas (plaga, enfermedad, deficiencia) salvo que una recomendación con fuente la mencione; usar «posible», «revise», «datos insuficientes»; máximo 180 palabras; español de Colombia. Validación automática: si la salida menciona una plaga/enfermedad que no está en las recomendaciones, se descarta y se usa la plantilla determinística.

## 8. Pantallas (piloto)
1. Landing pública (promesa, demo, tutoriales, registro).
2. Demo.
3. Tablero de organización: lista de lotes/fincas ordenada por (cambio desc, días sin dato desc), filtros por cultivo y técnico, exportar PDF.
4. Ficha de lote: mapa de clases con fecha, serie temporal (NDVI y NDMI), tabla de observaciones (usables y no usables con su % válido), recomendaciones con fuente, texto de la IA, clima, PDF.
5. Editor de lote (mapa, polígono, cultivo, fecha de siembra).
6. Configuración de organización (miembros, umbral, correo de alertas).
7. Panel interno de trabajos (solo admin de CultiVista).

## 9. Comunidad y lanzamiento (calco de Hospedy y MotoFlow, adaptado)
- **Canales propios:** página de Facebook, Instagram, TikTok y YouTube «CultiVista». Pilares: (a) tutoriales de la app, (b) «lo que ve el satélite» (una finca anónima por semana con antes/después), (c) datos del sector (clima IDEAM, precio interno del café FNC, cacao, arroz Fedearroz) con fuente, (d) educación: qué es NDVI, por qué las nubes, qué no puede ver un satélite.
- **Grupos de Facebook:** caficultores, cacaoteros, agro del Valle/Eje Cafetero/Huila/Tolima; tablero asistido como el de Hospedy (sugerencia diaria, 7 días por grupo, nunca automatizar la publicación).
- **Tutoriales:** serie «CultiVista en 8 pasos» con la línea de producción de Hospedy (voz Luisa, cuenta demo, estilo pausado y pantalla completa).
- **Campaña de prueba de 2 semanas** en Metricool (≤ 4 piezas/semana por regla de casa cuando pase a la cadena semanal), pauta pequeña a Mensajes.
- **Contacto directo B2B** (como talleres MotoFlow): lista de cooperativas y asociaciones de café y cacao (FNC comités, Fedecacao asociaciones, UMATA, SENA agro) con guion «se lo dejo montado con 3 fincas suyas en 15 minutos».
- **Beta cerrada:** 2 cooperativas (10–20 fincas cada una) + 10 fincas medianas, 6 semanas, gratis a cambio de retroalimentación y del dato de «¿cambió el orden de visitas?».
- **Agente semanal:** radar (noticias agro, clima, precios), producción en borrador (máx. 4/semana), informe de mejoras de producto los lunes, en la misma cadena de las otras marcas.
- **Lead magnet:** PDF «Cómo leer un mapa satelital de su finca» + plantilla de bitácora de visitas.
- Vocabulario prohibido: «precisión», «tiempo real», «inteligencia artificial que diagnostica», «detectamos plagas».

## 10. Plan del piloto (6–8 semanas, una persona + IA)
| Sem | Entrega |
|---|---|
| 1 | Supabase (esquema + RLS + pruebas de aislamiento), motor Python con contrato §3 y pruebas de regresión, worker en contenedor |
| 2 | Next.js: auth, organización, editor de lote, trabajo histórico, ficha de lote básica |
| 3 | Tablero de organización, serie temporal, PDF, correo semanal, catálogo café/cacao/arroz con reglas y fuentes |
| 4 | IA redactora con validación, demo pública con 3 lotes muestra, landing |
| 5 | Calibración del umbral de validez con 30 lotes reales (visual RGB vs SCL vs índice), ajuste de reglas, observabilidad |
| 6 | Beta cerrada: alta de 2 cooperativas + 10 fincas, tutoriales 1–4, página y grupos |
| 7–8 | Medición de la beta, ajustes, campaña de 2 semanas, informe de piloto |

Criterios de éxito del piloto: ≥ 70 % de lotes con al menos una observación usable por mes; ≥ 2 técnicos que declaren haber reordenado visitas; ≥ 15 cuentas activas; 0 incidentes de aislamiento; p95 del trabajo histórico < 5 min.

## 11. Fuera de alcance (v2 piloto)
SoilGrids, WhatsApp, 40 cultivos, todos los índices visibles, predicción de rendimiento, detección de plagas, app móvil, drone, mosaicos multiescena, cobro en línea, segundo proveedor automático.

## 12. Riesgos y supuestos
- [S] Umbral 60 % válido y 30 píxeles: a calibrar (sem. 5).
- [S] Alerta por caída ≥ 0,10: puede dispararse por cosecha, poda o renovación; por eso es «cambio», no «problema», y el usuario puede marcar «evento de manejo» en el lote.
- [I] Café bajo sombrío: el satélite ve mezcla café + sombrío; el valor absoluto sirve poco, el cambio relativo del mismo lote sí.
- [V] Earth Search sin SLA: por eso la interfaz de proveedor y la procedencia por observación.
- [S] Fly.io/Railway como alojamiento del worker: confirmar costo y región.
- [S] Precio: no se define en el piloto; hipótesis por lote/mes para fincas y por finca/mes para cooperativas.
- Legal: datos de ubicación de fincas = dato sensible comercial; política de privacidad y Ley 1581 desde el primer día; polígonos nunca públicos; la demo no guarda polígonos ajenos más de 7 días.

## 13. Decisiones que necesita JD
1. Nombre y dominio: ¿`cultivista.co` o similar? (verificar disponibilidad).
2. Alojamiento del worker (Fly.io / Railway / otro) y proyecto Supabase nuevo.
3. Voz de los tutoriales: ¿Luisa como Hospedy o una voz propia de marca?
4. Beta: ¿cooperativas con las que ya haya relación?
5. Disco frío para la caché vieja de 2,9 GB.

---
## 14. Revisión tras la etapa 2 (ChatGPT 88/100, 6-oct-2026) — cambios ACEPTADOS que prevalecen sobre lo anterior
Dictamen completo: `00_SISTEMA/chatgpt/entregas/2026-10-06-cultivista-etapa2-diseno-CHATGPT-web.md`.
1. **§3.3 validez en tres capas, no una:** `pct_clasificado` (4+5+6 sobre total), `pct_indice_valido` (solo 4+5), `pct_agua`, `pct_nube_sombra`, `pct_vegetacion`, `pct_suelo`. Agua (6) queda FUERA de NDVI/NDMI. Dos conteos: `n_px_scl_20m` y `n_px_10m_indice`; el mínimo se calibra sobre el de 20 m.
2. **§3.2 sin erosión de borde en mask_v1.** Rasterizar por centro de píxel; marcar `edge_pixel`; comparar con/sin borde en la calibración.
3. **§3.4 calibración de umbrales en semanas 1–2**, no en la 5. 60 % y 30 píxeles siguen siendo defaults de software hasta entonces.
4. **§3.5 NDMI y NDRE en grilla nativa de 20 m** (B08 agregado a 20 m); se almacenan y muestran como productos de 20 m. Variante B8A/B11 como experimento versionado.
5. **§3.8 cambio = mediana_actual − mediana(medianas de las 3 últimas válidas).** Base 0 «primera observación», 1 «comparación preliminar», ≥ 2 se muestra, 3 línea base completa. **Alerta −0,10 como feature flag apagado**; se registra `alert_candidate` en silencio y se contrasta con campo en la beta.
6. **§5 esquema:** agregar `eventos_manejo` (lote, fecha, tipo: poda | cosecha | renovación | siembra | inundación | otro, notas); `fincas.tecnico_responsable_id`; `lotes.geom_version`, `geom_updated_at`; `escenas.acquired_at`, `provider_published_at`, `epsg`, `processing_baseline`; `observaciones.n_px_scl`, `n_px_indice`, `scl_stats` JSONB, `algorithm_version`; `evaluaciones.baseline_ids`; `trabajos.next_retry_at`, `locked_at`, `worker_id`; `alertas.estado`, `motivo`. Índices e idempotencia como constraints (lista en el dictamen §3). RLS con función privada `security definer` o `organizacion_id` denormalizado; pruebas por operación (SELECT/INSERT/UPDATE/DELETE) y de Storage.
7. **§8 pantallas:** el tablero de cooperativa es «lista primero» (finca, última fecha válida, cambio, días sin dato, acción) con mapa diferido, payload mínimo, caché local del último estado, «Mis fincas», botón **«Marcar visitada + qué encontré»**, miniatura antes del mapa. El umbral de validez se oculta al usuario (solo admin de CultiVista). Fuera del piloto: NDVI+NDMI simultáneos, PDF de organización sofisticado, clima en todas las pantallas, teselas vectoriales.
8. **§7 IA:** prohibida toda causalidad no presente en las recomendaciones («debido a», «provocado por», «indica deficiencia», «presenta», «causado por» → plantilla determinística); clima solo como coexistencia («revise en campo si guarda relación»); NDMI nunca como «estrés hídrico»; niveles renombrados a **bajo / esperado / alto según regla** (no «estrés»/«crítico»). Suite adversarial fija de 12 casos con frases permitidas/prohibidas, re-ejecutada al cambiar modelo o prompt.
9. **§9 comunidad:** canales principales Facebook + WhatsApp comercial manual + YouTube (tutoriales) + LinkedIn B2B; Instagram y TikTok solo reutilizan. La demo arranca con un caso conocido («esta zona cambió → el técnico fue → esto encontró») y después «dibuje su lote». Onboarding asistido obligatorio para las 2 cooperativas beta (importar polígonos, 3–5 fincas que el técnico conozca, revisar la historia juntos).
10. **§10 plan reordenado:** S1 ciencia + seguridad + 30 lotes de calibración · S2 producto mínimo · S3 utilidad de cooperativa (frente a 1–2 técnicos) · S4 informes · S5 calibración real · S6 IA + demo + landing · S7 beta asistida · S8 medir. Recortables si aprieta: clima, PDF organizacional, campaña multicanal, agente semanal (se activa después de la beta).
11. **Go/no-go de la beta** = lista §8 del dictamen (ciencia, trazabilidad, seguridad, worker, UX móvil, IA, producto).

Rechazado o matizado por Claude: ninguno de fondo. Matiz: el agente semanal de contenidos se mantiene en el diseño, pero arranca después de la beta (S8+), como pide el dictamen.
