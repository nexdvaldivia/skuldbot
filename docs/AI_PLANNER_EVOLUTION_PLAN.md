# AI Planner Evolution: De Generador a Copiloto de Automatizacion

**Fecha**: 2026-04-15
**Autor**: Albert (Arquitectura)
**Prioridad**: MAXIMA — Este es el diferenciador #1 del producto
**Objetivo**: Que el AI Planner genere bots con la misma calidad que un experto humano

---

## El Problema

Hoy el AI Planner genera bots "funcionales" pero no enterprise-grade.
Un desarrollador experto crea mejores bots manualmente en menos tiempo
que refinando lo que genera el planner. Esto invierte el valor del producto.

**Estado actual**: Generador de flujos con prompt generico
**Estado objetivo**: Copiloto que sabe tanto como el mejor desarrollador de bots

---

## Arquitectura Propuesta

```
                    ┌──────────────────────────────┐
                    │      USUARIO                 │
                    │  "Automatiza el proceso de    │
                    │   FNOL para llamadas"         │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │     PLANNER AGENT            │
                    │                              │
                    │  1. Analiza el goal           │
                    │  2. Detecta industria         │
                    │  3. Busca templates (RAG)     │
                    │  4. Consulta catalogo (MCP)   │
                    │  5. Aplica reglas de calidad  │
                    │  6. Genera DSL                │
                    │  7. Valida compliance         │
                    │  8. Presenta con confianza    │
                    └──────────────┬───────────────┘
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        │                          │                           │
┌───────▼──────┐  ┌───────────────▼──────────┐  ┌────────────▼──────────┐
│ KNOWLEDGE    │  │ ENRICHED CATALOG         │  │ QUALITY RULES         │
│ BASE (RAG)   │  │ (MCP / Context)          │  │ ENGINE                │
│              │  │                          │  │                       │
│ Templates    │  │ 280+ nodos con:          │  │ Reglas por defecto:   │
│ por industria│  │ - Config schema completa │  │ - Error handling      │
│ Patrones     │  │ - Output schema          │  │ - Vault para secrets  │
│ reales       │  │ - Ejemplos de uso        │  │ - Compliance nodes    │
│ Best         │  │ - Patterns comunes       │  │                       │
│ practices    │  │ - Restricciones          │  │ Reglas por industria: │
│ Casos de     │  │ - Dependencies           │  │ - HIPAA: PII redact   │
│ exito        │  │                          │  │ - SOC2: audit log     │
│              │  │ Consulta en runtime      │  │ - PCI: mask cards     │
│ Vector DB    │  │ via MCP tools            │  │ - Insurance: evidence │
└──────────────┘  └──────────────────────────┘  └───────────────────────┘
```

---

## Fase 1: Enriched Catalog (2 semanas)

**Problema**: El planner tiene un catalogo de 3.5KB con nombres y descripciones cortas.
No sabe que `email.send` necesita `to`, `subject`, `body`, ni que `excel.write_range`
produce un `filePath` en el output.

### 1.1 Catalogo Completo por Nodo

Generar un JSON enriquecido con CADA nodo:

```json
{
  "type": "email.send",
  "category": "email",
  "label": "Send Email",
  "description": "Send an email via the default provider",
  "configSchema": [
    { "name": "to", "type": "text", "required": true, "description": "Recipient email(s)" },
    { "name": "subject", "type": "text", "required": true, "description": "Email subject" },
    { "name": "body", "type": "textarea", "required": true, "description": "Email body" },
    { "name": "html", "type": "boolean", "default": false, "description": "Send as HTML" },
    { "name": "attachments", "type": "text", "description": "File paths to attach" }
  ],
  "outputSchema": [
    { "name": "message_id", "type": "string" },
    { "name": "status", "type": "string", "values": ["sent", "failed"] }
  ],
  "patterns": [
    "Always use vault for credentials: ${vault.SMTP_PASSWORD}",
    "Connect error output to handle send failures",
    "Use email.mark_read after processing to avoid re-processing"
  ],
  "commonCombinations": [
    "email.read → email.download_attachment → document.pdf_read",
    "ai.extract_data → email.send (results notification)",
    "trigger.email_received → email.read → control.if"
  ],
  "securityNotes": [
    "Never log email body - may contain PII",
    "Use TLS for SMTP connections",
    "Credentials must be in Vault, never in config"
  ]
}
```

**Tarea**: Script que genera este JSON para los 280+ nodos a partir de:
- `nodeTemplates.ts` (configs)
- `registry.py` (engine mappings)
- Best practices documentadas

### 1.2 Context Window Optimization

El catalogo completo sera ~100KB+. No cabe en un prompt.
Solucion: **catalogo selectivo** basado en el goal del usuario.

```
Usuario: "Automatiza facturacion de emails"
  → Planner detecta: email, document/PDF, excel, ai (extraction)
  → Carga solo esos 4 catalogos (~15KB) en el prompt
  → El resto no se envia al LLM
```

**Tarea**: Intent classifier que selecciona categorias relevantes del goal.

### 1.3 Prompt Engineering Avanzado

Reescribir el system prompt del planner:

```
Eres un experto en automatizacion RPA con SkuldBot.
Generas workflows enterprise-grade que siguen estos principios:

REGLAS OBLIGATORIAS:
1. Todo nodo debe tener output de error (linea naranja) conectado
2. Credenciales siempre via ${vault.XXX}, NUNCA hardcoded
3. Si el workflow procesa PII/PHI, incluir compliance.protect_pii
4. Si el workflow es de healthcare, activar Evidence Pack
5. Loops deben tener max_iterations como safety
6. HTTP requests deben tener timeout y retry

CATALOGO DE NODOS DISPONIBLES:
[Catalogo selectivo segun el goal]

FORMATO DE SALIDA:
[DSL JSON schema]
```

---

## Fase 2: Knowledge Base / RAG (2 semanas)

**Problema**: El planner genera desde cero cada vez. No aprende de bots exitosos.

### 2.1 Template Library

Crear una coleccion de bots de referencia por industria:

| Template | Industria | Nodos | Descripcion |
|----------|-----------|:-----:|-------------|
| FNOL Call Processing | Insurance | 12 | Recibe llamada, extrae datos, crea reclamo |
| Invoice Processing | Finance | 8 | Lee email, descarga PDF, extrae datos, escribe Excel |
| Patient Intake | Healthcare | 10 | Lee formulario, valida datos, crea record FHIR |
| Claims Adjudication | Insurance | 15 | Evalua reclamo, decide aprobacion, notifica |
| Report Generation | General | 6 | Query DB, genera Excel, envia email |
| Data Migration | General | 8 | Lee origen, transforma, escribe destino |
| Web Scraping | General | 7 | Navega, extrae tabla, guarda CSV |
| Email Auto-Reply | General | 5 | Lee email, clasifica, genera respuesta con AI |
| Compliance Audit | Regulated | 10 | Lee datos, detecta PII, genera Evidence Pack |
| Customer Onboarding | SaaS | 9 | Crea cuenta, envia bienvenida, configura permisos |

### 2.2 RAG Pipeline

```
Goal del usuario
  → Generate embeddings
  → Search template library (top 3 matches)
  → Include matching templates in context
  → LLM genera basandose en templates reales + catalogo
```

Componentes:
- Vector DB: usar Chroma embebido en Studio (ya existe el nodo)
- Embeddings: OpenAI text-embedding-3-small o local (Ollama nomic-embed-text)
- Indexing: al instalar Studio, indexa la template library
- Runtime: antes de generar, busca templates similares

### 2.3 Learn from Success

Cuando un usuario genera un bot con el planner, lo refina, y lo marca como "bueno":
- Guardar el bot final como template anonimizado
- Incrementar el knowledge base local
- Opt-in para contribuir al knowledge base global (marketplace de templates)

---

## Fase 3: Quality Rules Engine (2 semanas)

**Problema**: El planner genera bots que "compilan" pero no son production-ready.

### 3.1 Reglas de Calidad Post-Generacion

Despues de generar el DSL, aplicar reglas automaticas:

```typescript
interface QualityRule {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  check: (dsl: BotDSL) => QualityViolation[];
  autoFix?: (dsl: BotDSL) => BotDSL;
}
```

**Reglas universales (siempre activas):**

| Regla | Severity | Auto-fix |
|-------|:--------:|:--------:|
| Todo nodo debe tener error output conectado | warning | Si — agrega log node en error |
| Secrets deben usar vault, no texto plano | error | Si — reemplaza con ${vault.XXX} |
| HTTP requests deben tener timeout | warning | Si — agrega timeout: 30 |
| Loops deben tener max_iterations | warning | Si — agrega max_iterations: 100 |
| Bot debe empezar con trigger | error | Si — agrega trigger.manual |
| Nodos huerfanos (sin conexion) | warning | No |
| Variables referenciadas deben existir | error | No |

**Reglas por industria (segun policy pack del tenant):**

| Regla | Industria | Severity | Auto-fix |
|-------|-----------|:--------:|:--------:|
| PII debe redactarse antes de logging | HIPAA | error | Si — inserta compliance.protect_phi |
| Evidence Pack obligatorio | HIPAA/SOC2 | error | Si — agrega logging.audit |
| LLM prompts con PHI deben redactarse | HIPAA | error | Si — inserta compliance.protect_phi antes de ai.* |
| Datos financieros requieren audit log | Finance | warning | Si — agrega logging.audit |
| Aprobacion humana para decisiones criticas | Insurance | warning | Si — inserta human.approval |

### 3.2 Auto-Fix Pipeline

```
DSL generado por LLM
  → Quality Rules Engine
  → Para cada violacion con auto-fix:
      → Aplicar fix automaticamente
      → Informar al usuario que se agrego
  → Para violaciones sin auto-fix:
      → Mostrar en Validation tab con explicacion
  → DSL mejorado listo para aplicar
```

### 3.3 Confidence Score Mejorado

Hoy el confidence es un numero que el LLM inventa. Debe basarse en datos reales:

```
Confidence = promedio de:
  - Template match score (0-1): cuanto se parece a un template conocido
  - Validation score (0-1): % de reglas que pasan
  - Completeness score (0-1): todos los campos required tienen valor
  - Coverage score (0-1): % del goal que esta cubierto por los nodos
```

---

## Fase 4: MCP Integration (1 semana)

**Problema**: El catalogo es estatico. Si se agrega un nodo nuevo, el planner no lo conoce.

### 4.1 MCP Tools para el Planner

El planner usa MCP tools para consultar informacion en runtime:

```
Tool: search_node_catalog
  Input: { query: "send email with attachments" }
  Output: [{ type: "email.send", config: {...}, patterns: [...] }]

Tool: get_node_details
  Input: { type: "excel.write_range" }
  Output: { configSchema: [...], outputSchema: [...], examples: [...] }

Tool: search_templates
  Input: { query: "invoice processing", industry: "finance" }
  Output: [{ name: "Invoice Bot", steps: 8, dsl: {...} }]

Tool: check_compliance
  Input: { industry: "healthcare", nodes: ["ai.extract_data", "email.send"] }
  Output: { rules: [...], requiredNodes: ["compliance.protect_phi"] }
```

### 4.2 ReAct Loop para el Planner

En vez de un solo LLM call, el planner usa un loop:

```
1. THINK: "El usuario quiere procesar facturas de email"
2. ACT: search_node_catalog("read email attachments") → [email.read, email.download_attachment]
3. ACT: search_node_catalog("extract data from PDF") → [document.pdf_read, ai.extract_data]
4. ACT: search_templates("invoice processing") → [Template: Invoice Bot]
5. ACT: check_compliance("finance", [...nodes]) → [Requiere: logging.audit]
6. THINK: "Tengo todos los nodos. Genero el DSL basandome en el template"
7. GENERATE: DSL completo
8. ACT: quality_check(dsl) → [2 warnings auto-fixed]
9. RESPOND: Plan con 8 pasos, confidence 0.92
```

---

## Fase 5: Feedback Loop y Mejora Continua (1 semana)

### 5.1 Telemetria de Calidad

Medir automaticamente:
- % de planes que se aplican sin modificacion
- % de nodos que el usuario cambia despues de aplicar
- Tiempo promedio de refinamiento
- Errores de compilacion en planes generados

### 5.2 A/B Testing de Prompts

- Probar diferentes versiones del system prompt
- Medir calidad de output (confidence, validation score, user satisfaction)
- Seleccionar automaticamente el mejor prompt

### 5.3 Community Templates

- Usuarios pueden compartir bots anonimizados al marketplace de templates
- El knowledge base crece con uso
- Templates con mas descargas se priorizan en RAG

---

## Feedback Tecnico de Luis (2026-04-15)

### Hallazgos criticos

1. **Gap de catalogo**: `nodeTemplates.ts` (Studio) y `registry.py` (Engine) tienen 49 tipos distintos. No estan 1:1. **BLOCKER para F1** — hay que normalizar primero.

2. **MCP hoy es texto en prompt**: `MCPClient` se instancia vacio, nunca se le hace `add_server`. El contexto MCP practico es cero.

3. **Catalogo actual es pobre**: Solo `node_type`, `category`, `description`, `config_fields`, `has_output`. Sin schemas completos, sin patterns, sin security notes.

### Decisiones tecnicas acordadas

| Decision | Acordado |
|----------|----------|
| Source of truth del catalogo | `catalog_contract.json` canonico, generado desde engine + studio. CI falla si hay drift |
| Formato de artefactos | `enriched_full.json` + `enriched_by_category/*.json` para context selectivo |
| Quien genera el script | Luis (tecnico) + Albert (contenido editorial: patterns, security, combinations) |
| Quality Rules Engine | **Rust** como motor principal (auto-fix antes de responder). TS solo para visualizar violaciones |
| Reglas Python del engine | Segunda capa de validacion. Auto-fix orquestado en Rust |
| ReAct loop estimacion | MVP: 5-7 dias. Multi-provider: +7-10 dias. Enterprise hardening: +4-5 dias. Total: 3-4 semanas |

### Orden de ejecucion revisado

Luis recomienda (y tiene razon): F1 → F3 → F4 → F2/F5 en paralelo

**Justificacion**: Sin catalogo enriquecido (F1), las reglas de calidad (F3) no tienen contra que validar. Sin reglas (F3), el ReAct loop (F4) genera bots de baja calidad. RAG y feedback (F2/F5) son incrementales.

## Timeline Revisado

| Fase | Semanas | Asignado | Impacto |
|------|:-------:|:--------:|---------|
| **F0: Catalog Normalization** | 1 | Luis | Eliminar el gap de 49 tipos. Source of truth unico |
| **F1: Enriched Catalog** | 2 | Luis (script) + Albert (contenido) | Catalogo completo con configs, outputs, patterns |
| **F3: Quality Rules (Rust)** | 2 | Luis (Rust engine) + Albert (reglas) | Auto-fix de error handling, vault, compliance |
| **F4: MCP + ReAct Loop** | 3-4 | Luis (Rust) | Tools en runtime, loop inteligente |
| **F2: RAG / Templates** | 2 | Albert (templates) + Luis (vector DB) | Knowledge base por industria |
| **F5: Feedback Loop** | 1 | Ambos | Telemetria, A/B testing |
| **Total** | **~11 semanas** | | |

---

## Metricas de Exito

| Metrica | Hoy | Target |
|---------|:---:|:------:|
| % planes que se aplican sin cambios | ~10% | >50% |
| % nodos correctamente configurados | ~40% | >85% |
| Compliance rules cumplidas automaticamente | 0% | 100% |
| Tiempo de creacion de bot (vs manual) | Igual o peor | 3x mas rapido |
| Confidence score promedio | ~0.5 (inventado) | >0.8 (real) |
| Templates en knowledge base | 0 | 50+ |

---

## Prioridad vs Master Plan

Este workstream es **paralelo** al Master Plan, no lo reemplaza:

- **Luis**: sigue con S2-S8 (backend, providers, deploy)
- **Albert**: ejecuta F1-F5 del planner + 5 Star Docu + UI

El planner es el feature que vende la plataforma. Si un prospect ve que puede
describir "automatiza mi proceso de FNOL" y en 30 segundos tiene un bot
enterprise-grade con compliance, error handling y Evidence Pack... eso es lo que
hace que SkuldBot no sea "otro RPA".

---

*(c) 2026 Skuld, LLC*
