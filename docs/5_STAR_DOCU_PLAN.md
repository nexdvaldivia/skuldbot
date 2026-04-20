# 5 Star Docu — Plan de Documentacion Enterprise-Grade

**Fecha**: 2026-04-15
**Responsable**: Albert (Arquitectura + UI)
**Sitio**: `docs.skuldbot.com` (`docs-components/`)
**Objetivo**: Documentacion que haga que cualquier usuario pueda usar SkuldBot al 100%

---

## Estado Actual

30 paginas MDX documentando 260+ nodos. La cobertura de referencia es buena
pero la calidad varia drasticamente:

- **6 paginas excelentes** (web, python, files, excel, code, bot) — con ejemplos, tablas, collapsibles
- **10 paginas medias** — tienen estructura pero faltan ejemplos
- **8 paginas pobres** — solo listan config sin demos ni contexto
- **0 tutoriales** paso a paso
- **0 guias de arquitectura**
- **0 cookbook** por industria

---

## Principio: 5 Estrellas

Cada pagina debe cumplir 5 criterios para ser "5 estrellas":

| Estrella | Criterio | Que significa |
|:--------:|----------|---------------|
| 1 | **Existe** | La pagina existe con estructura basica |
| 2 | **Completa** | Todos los nodos de la categoria estan documentados con config |
| 3 | **Ejemplos** | Cada nodo tiene al menos 1 ejemplo de DSL JSON + resultado esperado |
| 4 | **Contexto** | Guia de "cuando usar que", best practices, tips, warnings |
| 5 | **Tutorial** | Al menos 1 tutorial end-to-end que use nodos de esta categoria |

---

## Estado por Pagina

| Pagina | Actual | Target | Prioridad |
|--------|:------:|:------:|:---------:|
| ai | 2 | 5 | **P0** |
| ai-planner | 1 | 5 | **P0** |
| email | 2 | 5 | **P0** |
| api | 1 | 5 | **P0** |
| insurance | 1 | 5 | **P1** |
| human | 1 | 5 | **P1** |
| logging | 1 | 4 | **P1** |
| ms365 | 2 | 5 | **P1** |
| data | 2 | 4 | **P2** |
| trigger | 2 | 5 | **P2** |
| database | 2 | 4 | **P2** |
| vectordb | 2 | 4 | **P2** |
| document | 2 | 4 | **P2** |
| voice | 2 | 4 | **P2** |
| desktop | 2 | 4 | **P2** |
| compliance | 2 | 5 | **P2** |
| security | 2 | 4 | **P2** |
| dataquality | 2 | 4 | **P2** |
| storage | 3 | 5 | **P3** |
| control | 3 | 5 | **P3** |
| web | 5 | 5 | DONE |
| python | 4 | 5 | **P3** |
| files | 4 | 5 | **P3** |
| excel | 4 | 5 | **P3** |
| code | 4 | 5 | **P3** |
| bot | 4 | 5 | **P3** |
| dsl | 3 | 4 | **P3** |
| variables | 4 | 5 | **P3** |
| quickstart | 2 | 5 | **P1** |

---

## Paginas NUEVAS a Crear

| Pagina | Tipo | Prioridad | Contenido |
|--------|------|:---------:|-----------|
| `/tutorials/first-bot` | Tutorial | **P0** | Crear tu primer bot en 5 minutos |
| `/tutorials/ai-agent` | Tutorial | **P0** | Como construir un agente con herramientas |
| `/tutorials/invoice-processing` | Tutorial | **P1** | Bot que procesa facturas PDF con AI |
| `/tutorials/fnol-automation` | Tutorial | **P1** | Automatizacion FNOL para seguros |
| `/tutorials/data-pipeline` | Tutorial | **P2** | Pipeline de datos con Singer taps/targets |
| `/architecture/agent-vs-flow` | Guia | **P0** | Cuando usar agente vs flujo fijo |
| `/architecture/evidence-pack` | Guia | **P1** | Como funciona el Evidence Pack |
| `/architecture/compliance` | Guia | **P1** | Configurar Policy Packs (HIPAA, SOC2, etc.) |
| `/cookbook/healthcare` | Cookbook | **P1** | Recetas para healthcare |
| `/cookbook/insurance` | Cookbook | **P1** | Recetas para seguros |
| `/cookbook/finance` | Cookbook | **P2** | Recetas para finanzas |
| `/api-reference` | Referencia | **P2** | API del Orchestrator (OpenAPI/Swagger) |

---

## Plan de Ejecucion

### Ronda 1: P0 — Feature estrella (1 semana)

**AI / AI Agent** (de 2 a 5 estrellas):
- [ ] Agregar ejemplo DSL de agente basico con 2 herramientas
- [ ] Agregar diagrama visual de como conectar Model + Tools + Memory
- [ ] Explicar el loop ReAct (Observe → Reason → Act → Repeat)
- [ ] Agregar ejemplo: "Agente que lee email y extrae datos a Excel"
- [ ] Documentar output: result, tool_calls, reasoning_trace
- [ ] Agregar seccion "280+ herramientas disponibles como tools"
- [ ] Best practices: cuantas herramientas conectar, system prompt tips

**AI Planner** (de 1 a 5 estrellas):
- [ ] Explicar que es y como funciona
- [ ] Agregar ejemplo paso a paso con capturas
- [ ] Documentar los providers LLM soportados
- [ ] Agregar ejemplos de prompts que generan buenos flujos
- [ ] Tips de refinamiento

**Email** (de 2 a 5 estrellas):
- [ ] Agregar ejemplo DSL para cada nodo (send, read, reply, search, etc.)
- [ ] Agregar guia "Configurar SMTP vs Gmail vs Outlook"
- [ ] Ejemplo completo: "Bot que lee emails y responde automaticamente"
- [ ] Documentar providers: SMTP, IMAP, Gmail API, Outlook/Exchange

**API/HTTP** (de 1 a 5 estrellas):
- [ ] Agregar ejemplo DSL para GET, POST, PUT, DELETE
- [ ] Ejemplo: "Llamar a una REST API y procesar la respuesta"
- [ ] Documentar auth: API Key, Bearer Token, OAuth
- [ ] Agregar ejemplo con GraphQL
- [ ] Error handling: retry, timeout, status codes

**Tutorial: Primer Bot** (nuevo):
- [ ] Paso 1: Abrir Studio
- [ ] Paso 2: Drag & drop trigger manual
- [ ] Paso 3: Agregar nodo Log
- [ ] Paso 4: Conectar success
- [ ] Paso 5: Debug
- [ ] Paso 6: Ver resultado

**Tutorial: AI Agent** (nuevo):
- [ ] Paso 1: Crear nodo AI Agent
- [ ] Paso 2: Conectar AI Model (OpenAI)
- [ ] Paso 3: Conectar herramientas (Excel + Email)
- [ ] Paso 4: Escribir goal
- [ ] Paso 5: Ejecutar y ver reasoning trace
- [ ] Paso 6: Interpretar resultados

**Guia: Agent vs Flow** (nuevo):
- [ ] Cuando usar flujo fijo (predecible, rapido, simple)
- [ ] Cuando usar agente (impredecible, requiere razonamiento, muchas herramientas)
- [ ] Cuando combinar ambos (agente dentro de flujo)
- [ ] Tabla comparativa

### Ronda 2: P1 — Verticales y features enterprise (1 semana)

- [ ] Insurance: ejemplos FNOL, claims, policy lookup
- [ ] Human-in-the-Loop: ejemplos de approval flow, review, escalation
- [ ] Logging: ejemplos de audit log, timers, metrics
- [ ] MS365: ejemplos de email, calendar, teams, sharepoint
- [ ] Quickstart: reescribir con mas detalle y capturas
- [ ] Tutorial: Invoice Processing
- [ ] Tutorial: FNOL Automation
- [ ] Guia: Evidence Pack
- [ ] Guia: Compliance / Policy Packs
- [ ] Cookbook: Healthcare
- [ ] Cookbook: Insurance

### Ronda 3: P2 — Completar cobertura (1 semana)

- [ ] Agregar ejemplos a: data, trigger, database, vectordb, document, voice, desktop, compliance, security, dataquality
- [ ] Tutorial: Data Pipeline
- [ ] Cookbook: Finance
- [ ] API Reference (si el backend tiene OpenAPI generado)

### Ronda 4: P3 — Polish (1 semana)

- [ ] Mejorar paginas que ya estan bien pero les falta el 5to star (tutorial)
- [ ] Revisar consistencia visual entre todas las paginas
- [ ] Agregar cross-references entre categorias
- [ ] SEO: meta descriptions, headings, alt text

---

## Metricas de Exito

| Metrica | Actual | Target |
|---------|:------:|:------:|
| Paginas con 5 estrellas | 1 | 10+ |
| Paginas con 4+ estrellas | 6 | 25+ |
| Paginas con <3 estrellas | 8 | 0 |
| Tutoriales | 0 | 6 |
| Guias de arquitectura | 0 | 3 |
| Cookbooks por industria | 0 | 3 |
| API Reference | 0 | 1 |

---

*(c) 2026 Skuld, LLC*
