Vamos. Te dejo el modelo de ejecución cognitiva + el Policy Engine formal (en versión “implementable” para Skuldbot), con schemas, reglas y flujo de runtime.

1. Tres artefactos “source of truth”

En Skuldbot, todo gira alrededor de 3 contratos: 1. Node Manifest (por tipo de nodo/skill) 2. Workflow IR (tu flujo, independiente de UI) 3. Tenant Policy Pack (reglas por cliente/industria: HIPAA, SOC2, etc.)

⸻

2. Node Manifest (contrato formal de cada nodo)

Esto es lo que te permite gobernar 205 nodos sin morir.

NodeManifest (ejemplo)

{
"type": "data.tap.csv",
"displayName": "Read CSV",
"category": "Data Integration",
"inputs": {
"path": {"type":"string", "required": true},
"hasHeader": {"type":"boolean", "required": false, "default": true}
},
"outputs": {
"dataset": {"type":"dataset", "classification": "UNCLASSIFIED"}
},

"data": {
"consumes": ["UNCLASSIFIED"],
"produces": ["UNCLASSIFIED"],
"propagation": "NONE"
},

"capabilities": {
"egress": "NONE",
"writes": "NONE",
"deletes": "NONE",
"privilegedAccess": false
},

"controls": {
"requires": [],
"supports": ["AUDIT_LOG", "ARTIFACT_ENCRYPTION"]
},

"runtime": {
"idempotent": true,
"retryable": true,
"defaultRetry": {"max": 3, "backoffMs": 2000},
"timeoutMs": 600000
}
}

Manifiesto para nodos “peligrosos” (ej: Email / LLM externo)

{
"type": "comm.email.send",
"data": {
"consumes": ["UNCLASSIFIED","PII","PHI"],
"produces": ["UNCLASSIFIED"],
"propagation": "NONE"
},
"capabilities": { "egress": "EXTERNAL", "writes": "EXTERNAL" },
"controls": {
"requires": ["DLP_SCAN", "HITL_APPROVAL_IF_PII_OR_PHI"],
"supports": ["AUDIT_LOG","REDACTION"]
}
}

3. Workflow IR (lo que el LLM genera y tú compilas a React Flow)

Tu React Flow es vista; el IR es la verdad.

WorkflowIR (mínimo robusto)

{
"name": "Read Appointments",
"version": "1.0.0",
"variables": [
{"key":"filePath","type":"string","classification":"UNCLASSIFIED"}
],
"nodes": [
{"id":"n1","type":"trigger.form","inputs":{}},
{"id":"n2","type":"data.tap.csv","inputs":{"path":"{{vars.filePath}}"}},
{"id":"n3","type":"dataquality.validate","inputs":{"dataset":"{{n2.outputs.dataset}}"}}
],
"edges": [
{"from":"n1","to":"n2"},
{"from":"n2","to":"n3"}
]
}

4. Modelo de ejecución cognitiva (Control Plane + Runner)

Tu ejecución debe separar claramente planificación de ejecución.

4.1 Etapas del “Cognitive Execution” 1. Plan (LLM → IR) 2. Validate (schema + semántica + policy) 3. Compile (IR → ExecutionPlan) 4. Enforce (policy gates + control injection) 5. Run (runner) 6. Observe (telemetría + evidence pack) 7. Learn (feedback → recomendaciones)

ExecutionPlan (lo que corre el runner)

Incluye ya controles insertados y “resolved references”.

{
"runId": "run_123",
"workflowVersion": "1.0.0",
"steps": [
{
"stepId":"s1",
"nodeId":"n2",
"type":"data.tap.csv",
"inputs":{"path":"/secure/input/a.csv","hasHeader":true},
"controls":["AUDIT_LOG","ARTIFACT_ENCRYPTION"],
"classification": {"in":"UNCLASSIFIED","out":"UNCLASSIFIED"},
"retry":{"max":3,"backoffMs":2000},
"timeoutMs":600000
},
{
"stepId":"s2",
"nodeId":"n3",
"type":"dataquality.validate",
"inputs":{"datasetRef":"artifact://s1/dataset"},
"controls":["AUDIT_LOG"],
"classification":{"in":"UNCLASSIFIED","out":"UNCLASSIFIED"}
}
]
}

5. Policy Engine (formal) — lo que te hace enterprise

El Policy Engine tiene 3 funciones: 1. Clasificación y propagación de PII/PHI a través del grafo 2. Gating (permitir / exigir controles / bloquear) 3. Auto-inserción de controles (masking, de-id, HITL, vault, DLP, etc.)

5.1 Taxonomía de datos (simple pero suficiente)
• UNCLASSIFIED
• PII
• PHI
• PCI
• CREDENTIALS

Y una regla de “dominancia”:
CREDENTIALS > PCI > PHI > PII > UNCLASSIFIED

5.2 Propagación (regla base)

Para cada edge A→B:
• inClass(B) = max(outClass(A), varClassUsedByB, constantsClass)
• outClass(B) depende de su manifest:
• si el nodo “produce PHI” (ej: parse EHR) => PHI
• si es “redact” => baja clasificación (PHI→PII o PHI→UNCLASSIFIED según técnica)
• si es “pass-through” => out = in

Esto lo resuelves con un topological pass (DAG) o con iteración hasta converger si permites ciclos (yo recomiendo bloquear ciclos o tratarlos como subflows con límites).

5.3 Policy Pack (por tenant / industria)

Ejemplo de TenantPolicyPack:

{
"tenant": "UniversalGroup",
"rules": [
{
"id": "HIPAA_NO_PHI_EGRESS",
"when": {"dataContains":["PHI"], "capability":"egress", "egress":"EXTERNAL"},
"then": {"action":"BLOCK", "reason":"PHI cannot be sent to external destinations"}
},
{
"id": "PII_EMAIL_REQUIRES_HITL",
"when": {"dataContains":["PII","PHI"], "nodeType":"comm.email.send"},
"then": {"action":"REQUIRE_CONTROLS", "controls":["DLP_SCAN","HITL_APPROVAL"]}
},
{
"id": "LLM_EXTERNAL_REDACTION_REQUIRED",
"when": {"dataContains":["PII","PHI"], "nodeType":"ai.llm.call", "llmProvider":"external"},
"then": {"action":"REQUIRE_CONTROLS", "controls":["REDACTION","PROMPT_GUARD"]}
}
],
"defaults": {
"logging": {"redact": true, "storeDays": 90},
"artifacts": {"encryptAtRest": true}
}
}

6. Validaciones obligatorias (antes de “Build” y antes de “Run”)

Divide validación en 3 capas:

6.1 Schema validation (Ajv/Zod)
• estructura de IR correcta
• inputs requeridos

6.2 Semantic validation
• ids únicos
• referencias {{nX.outputs.y}} existentes
• tipos compatibles (dataset → validate)
• grafo válido (no nodos huérfanos, etc.)

6.3 Policy validation (lo importante)
• calcula data classification por nodo/edge
• evalúa reglas del policy pack
• genera:
• BLOCKS[] (no se puede compilar)
• REQUIRES_CONTROLS[] (auto insertables)
• WARNINGS[] (mejoras)

⸻

7. Auto-inserción de controles (lo que te hace mágico)

Cuando el policy engine diga “REQUIRE_CONTROLS”, tienes 2 opciones:

Opción A: “invisible injection” (recomendado)

El usuario no ve nodos extra, pero el ExecutionPlan añade wrappers:
• redact logs
• encrypt artifacts
• DLP scan
• HITL checkpoint

Opción B: “visible injection”

Inserta nodos en canvas:
• compliance.redact
• human.approval
• security.vault.store
• dlp.scan

Yo haría ambas:
• invisible por defecto (experiencia limpia)
• botón “Show compliance controls” para verlo.

⸻

8. Evidence Pack (para vender a regulated industries)

Por cada run, guardas:
• run.json (metadata)
• timeline.json (eventos step_start/step_end)
• inputs_redacted.json
• outputs_redacted.json
• artifacts/ (cifrados)
• policy_report.json (qué reglas aplicaron, qué controles se inyectaron)
• approvals.json (quién aprobó qué)

Eso te da audit ready de verdad.

⸻

9. El “AI Planner” (para que el LLM no rompa compliance)

Tu planner debe recibir:
• Node Catalog (manifests resumidos)
• TenantPolicyPack (resumen)
• Objetivo del usuario
• Contexto (fuentes, destino, restricciones)

Y devolver solo IR.

Luego tu validator/policy engine:
• corrige (auto-fix loop 1–2)
• o bloquea con mensajes accionables.

⸻

10. Qué haría mañana mismo en tu repo (orden de implementación)
    1.  NodeManifest registry (JSON + loader)
    2.  IR schema + validator (Ajv)
    3.  Classification propagation (PHI/PII)
    4.  PolicyPack rules + evaluator (BLOCK/REQUIRE/WARN)
    5.  ExecutionPlan compiler (incluye controls)
    6.  Evidence pack writer (mínimo viable)

Con eso ya tienes: “compliance-by-construction”.

⸻

Si quieres que te lo deje aún más “plug and play”, dime solo esto (una línea):
¿Tus nodos ya tienen un type estilo data.tap.csv / dataquality.validate como en la UI?
Si sí, te doy el JSON Schema exacto (Ajv) para NodeManifest, WorkflowIR, TenantPolicyPack y el pseudo-código del propagator + evaluator tal cual para NestJS.

yo dije: Quiero que las variables se propaguen de nodo a nodo como hace n8n

Perfecto. “Como n8n” en realidad significa 3 cosas a la vez: 1. cada nodo recibe un contexto con outputs de nodos anteriores 2. puedes referenciar esos valores con expresiones (ej: {{$json.foo}}) 3. el flujo puede operar por items (lista de registros) y cada nodo transforma esa lista

Te dejo un diseño Skuldbot-ready (y muy implementable) que replica ese patrón sin volverte loco.

⸻

1. Modelo de datos tipo n8n: items[] + json/binary

En n8n, casi todo viaja como una lista de items:

type Item = {
json: Record<string, any>; // datos estructurados
binary?: Record<string, BinaryRef>; // archivos
meta?: Record<string, any>; // trazas, ids, etc.
}

type NodeIO = {
items: Item[];
}

    •	Un CSV leído produce items (cada fila = un item.json)
    •	Un PDF produce binary.file + json (campos extraídos)
    •	Un “Validate Data” puede marcar meta.validationErrors

Clave: Si estandarizas esto, la propagación “sale sola”.

2. Contexto de ejecución: ExecutionContext

Cada nodo corre con un contexto como:

type ExecutionContext = {
vars: Record<string, any>; // variables globales del workflow (inputs)
env: Record<string, any>; // env vars (no secrets)
secrets: SecretRefStore; // acceso controlado
$run: { id: string; startedAt: string; tenantId: string };
$node: Record<string, { items: Item[] }>; // outputs por nodoId o nombre
$input: { items: Item[] }; // entrada del nodo actual
}

¿Qué se “propaga”?
• Por defecto: $input.items viene del nodo anterior (o merge si hay varios edges)
	•	Además: siempre está accesible ctx.$node.<nodeId>.items para referencias directas

Esto te permite:
• “pásame lo que viene por el edge” ✅
• “accede a outputs de cualquier nodo previo” ✅

⸻

3. Lenguaje de expresiones (mínimo viable)

Te recomiendo copiar el espíritu n8n sin copiar toda su complejidad:

Sintaxis (simple)
• {{ ... }} para expresiones
• Helpers:
• $json = ctx.$input.items[0].json (o item actual si estás en modo map)
• $item(i).json = item i
• $node("Read CSV").json = primer item del nodo (o .items)
• $vars.foo, $env.BAR
• len(), toNumber(), now(), coalesce()

Ejemplos:
• {{ $json.email }}
• {{ $node("Read CSV").items }}
• {{ coalesce($json.amount, 0) }}
• {{ $vars.filePath }}

Regla de oro: Si un input field contiene {{ }}, evalúas; si no, literal.

⸻

4. Propagación “por item” (modo n8n real)

Hay dos modos de ejecución por nodo:

A) mode: "map" (default)

El nodo transforma item por item:
• input: items[]
• output: items[] (misma longitud o modificada)

Ej: “Validate Data” agrega meta.valid=true/false a cada item.

B) mode: "reduce" (aggregator)

Consume todos los items y produce 1 (o pocos):

Ej: “Write CSV”, “Send Email summary”, “Load to DB batch”.

Esto te permite: pipelines de datos y RPA en el mismo paradigma.

⸻

5. Merge cuando un nodo tiene múltiples entradas

n8n tiene varias estrategias; tú implementa 3 (suficiente):
• append: concatena items de todas las ramas
• zip: item1 con item1 (útil para joins simples)
• byKey: merge por llave (ej: customer_id)

En el IR:

{
"id":"merge1",
"type":"control.merge",
"inputs": { "strategy":"append" }
}

6. Variables globales vs variables por flujo

Para “variables” tipo n8n, define 2 niveles:

Globales (workflow vars)
• definidas en trigger o settings
• disponibles como $vars

Temporales (por run)
• creadas por nodos “Set Variable”
• viven en ctx.vars pero con control (y audit)

Nodo:
• control.setVar { key: "threshold", value: "{{ $json.limit }}" }

7. Cómo lo haces robusto (y enterprise)

A) Tipado ligero + validación

Cada input de nodo define su tipo (string/number/dataset/items/file).
Después de evaluar expresiones, validas.

B) Data classification se propaga con los items

Cada Item lleva meta.classification (UNCLASSIFIED/PII/PHI…).
Tu policy engine evalúa por:
• nodo capability + item.classification
• y si hay egress, exige controles

⸻

8. En tu UI (React Flow) cómo se siente “como n8n”
   1. Cada input field permite “Expression mode” (toggle)
   2. Panel “Data” muestra:
      • $input preview (primeros 5 items)
      • $node("X") preview
      • $vars preview
   3. Autocomplete en expresiones:
      • $json.<keys>
      • nodos previos y sus outputs

Eso hace que sea n8n vibes inmediatamente.

⸻

9. Implementación mínima (lo que haría primero)
   1. Estándar Item[] en todos los nodos
   2. Resolver de expresiones {{ }} + helpers $json/$node/$vars
   3. Ejecución map y reduce
   4. Merge append
   5. Panel preview + autocomplete básico

Con eso ya tienes propagación de variables como n8n (y mejor, porque tú tienes compliance nativo).

⸻

Si me dices cómo ejecutas hoy (uno de estos):
• A) cada nodo recibe un “payload object” suelto
• B) ya tienes algo tipo items[]/dataset

te adapto esto a tu realidad exacta y te dejo el contracto final de ExecutionContext + ejemplos de 3 nodos (Read CSV, Validate Data, LLM Call) con sus inputs/outputs y cómo referenciarlos en expresiones.

yo dije: creo que ese modelo sera un poco pesado para mi porque tengo bases de datos

Te entiendo 100%. El modelo “items[]” tipo n8n funciona genial para eventos/JSON, pero cuando tu mundo es bases de datos + datasets grandes, puede volverse pesado si lo interpretas como “pasar filas” por memoria.

La clave es esta:

👉 propagar variables no significa propagar datos.
Significa propagar referencias (handles) a datos.

El enfoque correcto para Skuldbot (DB-first, liviano)

1. Contexto por referencia

En vez de items[] grandes, cada nodo produce “salidas” que son:
• valores pequeños (string/number/json)
• DatasetRef (puntero a datos grandes)
• FileRef (puntero a archivo)
• TableRef / QueryRef (puntero a tabla o query)

Ejemplo:
• Read CSV → datasetRef: ds_abc123
• DB Query → datasetRef: ds_q987 (que internamente puede ser una vista/materialización/consulta paginada)
• Validate Data → reportRef: rpt_55, passed: true/false

Nada se copia. Solo viajan IDs.

⸻

2. Tu “propagación n8n” pero con handles

Sigues teniendo el feeling de n8n:
• inputs pueden usar expresiones {{ }}
• y acceder a outputs anteriores

Pero lo que fluye por los edges es un objeto liviano:

{
"dataset": { "ref": "ds_abc123", "schema": "...", "rowCount": 12003450 },
"meta": { "classification": "PHI" }
}

3. Dos modos de nodo (súper simple)

Para DBs, esto te salva:

A) Nodes “metadata-only” (default)
Trabajan con DatasetRef y generan otros refs.
• filter, select columns, join, validate, profile…
• NO materializan salvo que sea necesario

B) Nodes “materializers / sinks”
Escriben a destino:
• db.load, write.parquet, export.csv, send.email (con límites)

⸻

Expresiones sin dolor (igual que n8n)

No necesitas $json ni items. Usa algo más enterprise:
• {{ vars.filePath }}
• {{ node("Read CSV").outputs.dataset.ref }}
• {{ node("DB Query").outputs.dataset.rowCount }}

Y listo.

Tu runtime resuelve eso a valores/refs.

⸻

Cómo modelar “dataset” para que sea potente y barato

Define DatasetRef como una entidad en tu backend/orchestrator:

DatasetRef
• id
• sourceType: csv | db | api | parquet | view
• location: uri o (connId + query)
• schema
• classification: UNCLASSIFIED/PII/PHI
• lineage: de qué node salió
• stats: rowCount, nullRates, etc. (lazy)

Ejemplos internos:
• CSV: file://.../a.csv
• DB: { connId:"pg1", query:"SELECT ...", params:{...} }
• Parquet: s3://bucket/path/\*.parquet

Así tus nodos de calidad/compliance trabajan sobre refs, no sobre datos en RAM.

⸻

“Propagación de variables” como n8n, pero DB-friendly

Regla simple:
• El edge no pasa “data”, pasa ContextRef
• El contexto trae:
• outputs del nodo anterior (refs/valores)
• acceso a outputs de cualquier nodo por node(id)

Eso te da:
• chaining natural
• debugging fácil (porque todo tiene id)
• compliance fácil (porque classification viaja con el ref)

⸻

Lo mínimo que te recomiendo implementar ya 1. Output store por run:
• runId + nodeId -> outputs (refs/valores) 2. Expression resolver para {{ node("X").outputs... }} 3. DatasetRef registry (en DB del orchestrator) 4. Policy engine que evalúe usando classification del DatasetRef

Con eso tienes la experiencia “n8n” sin el peso de items[].

⸻

Si me dices una cosa: tus nodos hoy, ¿devuelven dataset como (A) data en memoria, (B) path a archivo, o (C) query/tabla?
Con eso te propongo el contrato exacto de outputs (DatasetRef) que encaja con tu implementación actual sin reescribir medio sistema.

Perfecto, Dubiel. Con lo que me pasaste ya puedo devolverte lo pedible: schemas Ajv exactos + pseudo-código + ExecutionPlan. Te lo dejo en formato “copiar/pegar” (y con decisiones de diseño que encajan con tu category.action, container nodes y tus nodos compliance/dataquality).

⸻

1. JSON Schema (Ajv) — NodeManifest extendido (NodeTemplate+metadata)

Notas de diseño
• Lo llamo NodeManifest para separar “template UI” vs “contrato runtime”.
• configSchema y outputSchema te los dejo como “passthrough” (porque ya tienes tu propio ConfigField/OutputField), pero con estructura mínima para validar.
• Clasificaciones: UNCLASSIFIED | PII | PHI | PCI | CREDENTIALS.
• propagation define cómo se calcula output classification:
• NONE = no hereda
• PASS_THROUGH = out = in (si no define produces explícito)
• DERIVE = nodo define produces según lógica (ej: extract PHI)
• TRANSFORM = puede bajar clasificación si aplica control (mask/redact/tokenize)

node-manifest.schema.json

{
"$id": "https://skuldbot.dev/schemas/node-manifest.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
"title": "SkuldBot NodeManifest",
"type": "object",
"required": ["type", "category", "label", "description", "icon", "defaultConfig", "configSchema", "data", "capabilities", "controls", "runtime"],
"additionalProperties": false,

"properties": {
"type": {
"type": "string",
"minLength": 3,
"pattern": "^[a-z]+\\.[a-z0-9_]+(\\.[a-z0-9_]+)_$",
"description": "category.action[.subaction] e.g., trigger.form, ai.llm.call"
},
"category": {
"type": "string",
"minLength": 2,
"pattern": "^[a-z]a-z0-9_]\_$"
},
"label": { "type": "string", "minLength": 1 },
"description": { "type": "string", "minLength": 1 },
"icon": { "type": "string", "minLength": 1 },

    "defaultConfig": { "type": "object", "additionalProperties": true },

    "configSchema": {
      "type": "array",
      "minItems": 0,
      "items": { "$ref": "#/$defs/configField" }
    },
    "outputSchema": {
      "type": "array",
      "minItems": 0,
      "items": { "$ref": "#/$defs/outputField" }
    },

    "data": { "$ref": "#/$defs/dataPolicy" },
    "capabilities": { "$ref": "#/$defs/capabilities" },
    "controls": { "$ref": "#/$defs/controls" },
    "runtime": { "$ref": "#/$defs/runtime" }

},

"$defs": {
"classification": {
"type": "string",
"enum": ["UNCLASSIFIED", "PII", "PHI", "PCI", "CREDENTIALS"]
},

    "propagationMode": {
      "type": "string",
      "enum": ["NONE", "PASS_THROUGH", "DERIVE", "TRANSFORM"]
    },

    "dataPolicy": {
      "type": "object",
      "required": ["consumes", "produces", "propagation"],
      "additionalProperties": false,
      "properties": {
        "consumes": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/classification" },
          "uniqueItems": true
        },
        "produces": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/classification" },
          "uniqueItems": true
        },
        "propagation": { "$ref": "#/$defs/propagationMode" },

        "outputClassificationOverride": {
          "type": "object",
          "additionalProperties": { "$ref": "#/$defs/classification" },
          "description": "Optional per-output field classification override: { fieldName: 'PHI' }"
        }
      }
    },

    "egressMode": { "type": "string", "enum": ["NONE", "INTERNAL", "EXTERNAL"] },
    "writeMode": { "type": "string", "enum": ["NONE", "INTERNAL", "EXTERNAL"] },

    "capabilities": {
      "type": "object",
      "required": ["egress", "writes", "deletes", "privilegedAccess"],
      "additionalProperties": false,
      "properties": {
        "egress": { "$ref": "#/$defs/egressMode" },
        "writes": { "$ref": "#/$defs/writeMode" },
        "deletes": { "type": "boolean" },
        "privilegedAccess": { "type": "boolean" },

        "network": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "allowDomains": {
              "type": "array",
              "items": { "type": "string", "minLength": 1 },
              "uniqueItems": true
            },
            "denyDomains": {
              "type": "array",
              "items": { "type": "string", "minLength": 1 },
              "uniqueItems": true
            }
          }
        }
      }
    },

    "controlType": {
      "type": "string",
      "enum": [
        "AUDIT_LOG",
        "ARTIFACT_ENCRYPTION",
        "LOG_REDACTION",
        "DLP_SCAN",
        "HITL_APPROVAL",
        "MASK",
        "REDACT",
        "PSEUDONYMIZE",
        "HASH",
        "GENERALIZE",
        "ENCRYPT",
        "TOKENIZE",
        "VAULT_STORE",
        "PROMPT_GUARD",
        "RATE_LIMIT",
        "TIMEOUT_GUARD"
      ]
    },

    "controls": {
      "type": "object",
      "required": ["requires", "supports"],
      "additionalProperties": false,
      "properties": {
        "requires": {
          "type": "array",
          "items": { "$ref": "#/$defs/controlType" },
          "uniqueItems": true
        },
        "supports": {
          "type": "array",
          "items": { "$ref": "#/$defs/controlType" },
          "uniqueItems": true
        }
      }
    },

    "retryPolicy": {
      "type": "object",
      "required": ["max", "backoffMs"],
      "additionalProperties": false,
      "properties": {
        "max": { "type": "integer", "minimum": 0, "maximum": 50 },
        "backoffMs": { "type": "integer", "minimum": 0, "maximum": 3600000 }
      }
    },

    "runtime": {
      "type": "object",
      "required": ["idempotent", "retryable", "defaultRetry", "timeoutMs"],
      "additionalProperties": false,
      "properties": {
        "idempotent": { "type": "boolean" },
        "retryable": { "type": "boolean" },
        "defaultRetry": { "$ref": "#/$defs/retryPolicy" },
        "timeoutMs": { "type": "integer", "minimum": 1000, "maximum": 86400000 }
      }
    },

    "configField": {
      "type": "object",
      "required": ["key", "type"],
      "additionalProperties": true,
      "properties": {
        "key": { "type": "string", "minLength": 1 },
        "type": { "type": "string", "minLength": 1 },
        "required": { "type": "boolean" },
        "default": {}
      }
    },

    "outputField": {
      "type": "object",
      "required": ["key", "type"],
      "additionalProperties": true,
      "properties": {
        "key": { "type": "string", "minLength": 1 },
        "type": { "type": "string", "minLength": 1 },
        "classification": { "$ref": "#/$defs/classification" }
      }
    }

}
}

2. JSON Schema (Ajv) — TenantPolicyPack

Notas
• Reglas tipo “when/then”.
• when soporta filtros por:
• dataContains (PII/PHI…)
• nodeType / nodeCategory
• capability flags (egress/writes/deletes/privilegedAccess)
• egress/writes mode
• then puede:
• BLOCK
• REQUIRE_CONTROLS
• WARN
• Puedes añadir severity y message.

tenant-policy-pack.schema.json

{
"$id": "https://skuldbot.dev/schemas/tenant-policy-pack.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
"title": "SkuldBot TenantPolicyPack",
"type": "object",
"required": ["tenantId", "version", "rules", "defaults"],
"additionalProperties": false,

"properties": {
"tenantId": { "type": "string", "minLength": 1 },
"version": { "type": "string", "minLength": 1 },
"industry": { "type": "string" },

    "defaults": {
      "type": "object",
      "required": ["logging", "artifacts"],
      "additionalProperties": false,
      "properties": {
        "logging": {
          "type": "object",
          "required": ["redact", "storeDays"],
          "additionalProperties": false,
          "properties": {
            "redact": { "type": "boolean" },
            "storeDays": { "type": "integer", "minimum": 1, "maximum": 3650 }
          }
        },
        "artifacts": {
          "type": "object",
          "required": ["encryptAtRest"],
          "additionalProperties": false,
          "properties": {
            "encryptAtRest": { "type": "boolean" }
          }
        }
      }
    },

    "rules": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/rule" }
    }

},

"$defs": {
"classification": {
"type": "string",
"enum": ["UNCLASSIFIED", "PII", "PHI", "PCI", "CREDENTIALS"]
},
"controlType": {
"type": "string",
"enum": [
"AUDIT_LOG",
"ARTIFACT_ENCRYPTION",
"LOG_REDACTION",
"DLP_SCAN",
"HITL_APPROVAL",
"MASK",
"REDACT",
"PSEUDONYMIZE",
"HASH",
"GENERALIZE",
"ENCRYPT",
"TOKENIZE",
"VAULT_STORE",
"PROMPT_GUARD",
"RATE_LIMIT",
"TIMEOUT_GUARD"
]
},
"actionType": { "type": "string", "enum": ["BLOCK", "REQUIRE_CONTROLS", "WARN"] },

    "when": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "dataContains": {
          "type": "array",
          "items": { "$ref": "#/$defs/classification" },
          "minItems": 1,
          "uniqueItems": true
        },
        "nodeType": { "type": "string", "minLength": 1 },
        "nodeCategory": { "type": "string", "minLength": 1 },

        "capability": { "type": "string", "enum": ["egress", "writes", "deletes", "privilegedAccess"] },
        "egress": { "type": "string", "enum": ["NONE", "INTERNAL", "EXTERNAL"] },
        "writes": { "type": "string", "enum": ["NONE", "INTERNAL", "EXTERNAL"] },
        "deletes": { "type": "boolean" },
        "privilegedAccess": { "type": "boolean" },

        "networkDomainMatches": { "type": "string", "minLength": 1 }
      }
    },

    "then": {
      "type": "object",
      "required": ["action"],
      "additionalProperties": false,
      "properties": {
        "action": { "$ref": "#/$defs/actionType" },
        "controls": {
          "type": "array",
          "items": { "$ref": "#/$defs/controlType" },
          "uniqueItems": true
        },
        "severity": { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
        "message": { "type": "string" }
      },
      "allOf": [
        {
          "if": { "properties": { "action": { "const": "REQUIRE_CONTROLS" } }, "required": ["action"] },
          "then": { "required": ["controls"] }
        }
      ]
    },

    "rule": {
      "type": "object",
      "required": ["id", "when", "then"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "description": { "type": "string" },
        "when": { "$ref": "#/$defs/when" },
        "then": { "$ref": "#/$defs/then" }
      }
    }

}
}

3. Pseudo-código — Classification Propagator

Principios
• Dominancia: CREDENTIALS > PCI > PHI > PII > UNCLASSIFIED
• Por nodo:
• inClass viene de inputs (edges + vars referenciadas + literals si aplican)
• outClass depende del manifest:
• DERIVE: usa max(manifest.produces)
• PASS_THROUGH: out = max(inClass, produces?) (si produces incluye algo más alto)
• TRANSFORM: out = applyTransform(out, controlsInjected) (si hay mask/redact/tokenize)
• NONE: out = max(produces) (no hereda)
• Container nodes (control.if, try_catch, loop) se tratan como “pass-through” para clasificación del control plane (y propagas dentro recursivamente).

TypeScript-like pseudo

type Classification = "UNCLASSIFIED" | "PII" | "PHI" | "PCI" | "CREDENTIALS";

const rank: Record<Classification, number> = {
UNCLASSIFIED: 0,
PII: 1,
PHI: 2,
PCI: 3,
CREDENTIALS: 4,
};

function maxClass(a: Classification, b: Classification): Classification {
return rank[a] >= rank[b] ? a : b;
}

function maxOf(list: Classification[], fallback: Classification): Classification {
let cur = fallback;
for (const c of list) cur = maxClass(cur, c);
return cur;
}

type NodeClassInfo = { in: Classification; out: Classification };

function propagateClassification(params: {
dsl: BotDSL;
manifestsByType: Record<string, NodeManifest>;
varDefs?: Record<string, { classification?: Classification }>;
// Optional: pre-injected controls by nodeId (if you do "evaluate then inject then propagate again")
injectedControlsByNodeId?: Record<string, string[]>;
}): Record<string, NodeClassInfo> {

const { dsl, manifestsByType } = params;
const varDefs = params.varDefs ?? {};
const injected = params.injectedControlsByNodeId ?? {};

// 1) Build adjacency (edges) from your DSL representation
// You likely have edges separately in your ReactFlow state; in BotDSL you can derive from node outputs wiring.
// For now assume you can build: incoming[nodeId] = nodeIds that connect to it.
const incoming: Record<string, string[]> = buildIncomingEdges(dsl);

// 2) Topological order (assume DAG at the graph level; container nodes handled separately)
const order = topoSort(dsl.nodes, incoming);

const classMap: Record<string, NodeClassInfo> = {};

// helper: compute classification from expressions like {{ vars.x }} or {{ node("n2").outputs... }}
function inferFromConfig(node: DSLNode): Classification {
// Minimal version: scan config values for variable references, pull their classification.
// If you track DatasetRef classification at runtime, you can skip deep parsing here.
let c: Classification = "UNCLASSIFIED";
const refs = extractRefs(node.config); // implement: find "vars.xxx" used
for (const ref of refs.vars) {
const vc = varDefs[ref]?.classification ?? "UNCLASSIFIED";
c = maxClass(c, vc);
}
return c;
}

function applyTransformIfAny(out: Classification, controls: string[], nodeType: string): Classification {
// conservative: only allow downgrades if explicit transform controls exist
// Example: TOKENIZE/REDACT can reduce PHI/PII to UNCLASSIFIED, depending on your policy.
const hasRedact = controls.includes("REDACT");
const hasTokenize = controls.includes("TOKENIZE");
const hasMask = controls.includes("MASK") || controls.includes("PSEUDONYMIZE") || controls.includes("HASH") || controls.includes("GENERALIZE");

    // You can tune these:
    if (out === "PHI" && (hasRedact || hasTokenize)) return "UNCLASSIFIED";
    if (out === "PII" && (hasRedact || hasTokenize)) return "UNCLASSIFIED";
    if ((out === "PHI" || out === "PII") && hasMask) return out; // masking often still considered sensitive
    return out;

}

// 3) propagate
for (const node of order) {
const manifest = manifestsByType[node.type];
if (!manifest) {
// Unknown nodes: be safe
classMap[node.id] = { in: "UNCLASSIFIED", out: "PHI" }; // or "PII" (your choice)
continue;
}

    // compute inbound classification
    let inC: Classification = "UNCLASSIFIED";

    // edges
    for (const parentId of (incoming[node.id] ?? [])) {
      const parentOut = classMap[parentId]?.out ?? "UNCLASSIFIED";
      inC = maxClass(inC, parentOut);
    }

    // variables referenced in config
    inC = maxClass(inC, inferFromConfig(node));

    // manifest consumes doesn't force classification up; it constrains allowed inputs.
    // You enforce consumes later in evaluator.

    // compute base out
    const producesMax = maxOf(manifest.data.produces, "UNCLASSIFIED");
    let outC: Classification;

    switch (manifest.data.propagation) {
      case "NONE":
        outC = producesMax;
        break;
      case "DERIVE":
        outC = producesMax; // treat as authoritative
        break;
      case "PASS_THROUGH":
        outC = maxClass(inC, producesMax);
        break;
      case "TRANSFORM":
        outC = maxClass(inC, producesMax);
        outC = applyTransformIfAny(outC, injected[node.id] ?? [], node.type);
        break;
      default:
        outC = maxClass(inC, producesMax);
    }

    classMap[node.id] = { in: inC, out: outC };

    // recurse into container children if present
    if (node.children?.length) {
      // You can run a sub-propagation using the container's inC as baseline for the first child.
      // Or you can just propagate within children based on their internal edges.
      // Keep it simple: treat container as pass-through for outer graph, propagate children internally.
      propagateChildren(node, manifest, classMap, manifestsByType, inC, injected);
    }

}

return classMap;
}

4. Pseudo-código — Policy Evaluator (gating + auto-controls)

Inputs
• dsl: BotDSL
• classMap: nodeId -> {in,out}
• manifestsByType
• policyPack: TenantPolicyPack

Output
• blocks[]
• requirements[] (nodeId -> controls[])
• warnings[]

Evaluator pseudo

type PolicyResult = {
blocks: Array<{ nodeId: string; ruleId: string; message: string; severity: string }>;
requiresControls: Record<string, Set<string>>;
warnings: Array<{ nodeId: string; ruleId: string; message: string; severity: string }>;
};

function evaluatePolicies(params: {
dsl: BotDSL;
manifestsByType: Record<string, NodeManifest>;
classMap: Record<string, { in: Classification; out: Classification }>;
policyPack: TenantPolicyPack;
}): PolicyResult {

const { dsl, manifestsByType, classMap, policyPack } = params;

const res: PolicyResult = {
blocks: [],
requiresControls: {},
warnings: [],
};

function addControl(nodeId: string, control: string) {
if (!res.requiresControls[nodeId]) res.requiresControls[nodeId] = new Set<string>();
res.requiresControls[nodeId].add(control);
}

// Apply global defaults (ex: always encrypt artifacts / redact logs)
for (const node of dsl.nodes) {
if (policyPack.defaults.artifacts.encryptAtRest) addControl(node.id, "ARTIFACT_ENCRYPTION");
if (policyPack.defaults.logging.redact) addControl(node.id, "LOG_REDACTION");
addControl(node.id, "AUDIT_LOG");
}

for (const node of dsl.nodes) {
const manifest = manifestsByType[node.type];
if (!manifest) continue;

    const nodeOut = classMap[node.id]?.out ?? "UNCLASSIFIED";
    const nodeCat = manifest.category;
    const caps = manifest.capabilities;

    // 1) hard constraints: manifest.controls.requires must be satisfied
    for (const c of manifest.controls.requires) addControl(node.id, c);

    // 2) enforce consumes: if input classification not allowed -> BLOCK
    const nodeIn = classMap[node.id]?.in ?? "UNCLASSIFIED";
    const consumesMaxAllowed = new Set(manifest.data.consumes);
    if (!consumesMaxAllowed.has(nodeIn) && rank[nodeIn] > maxAllowedRank(consumesMaxAllowed)) {
      res.blocks.push({
        nodeId: node.id,
        ruleId: "MANIFEST_CONSUMES_VIOLATION",
        message: `Node ${node.type} does not allow input classification ${nodeIn}`,
        severity: "HIGH",
      });
    }

    // 3) evaluate tenant rules
    for (const rule of policyPack.rules) {
      if (!matchesWhen(rule.when, { node, manifest, nodeOut })) continue;

      const action = rule.then.action;
      const msg = rule.then.message ?? rule.description ?? rule.id;
      const severity = rule.then.severity ?? "HIGH";

      if (action === "BLOCK") {
        res.blocks.push({ nodeId: node.id, ruleId: rule.id, message: msg, severity });
      } else if (action === "REQUIRE_CONTROLS") {
        for (const c of (rule.then.controls ?? [])) addControl(node.id, c);
      } else if (action === "WARN") {
        res.warnings.push({ nodeId: node.id, ruleId: rule.id, message: msg, severity });
      }
    }

    // 4) capability-based default gates (optional)
    // Example: if EXTERNAL egress and data is PII/PHI => require DLP + HITL
    if (caps.egress === "EXTERNAL" && (nodeOut === "PII" || nodeOut === "PHI")) {
      addControl(node.id, "DLP_SCAN");
      addControl(node.id, "HITL_APPROVAL");
    }

}

return res;
}

function matchesWhen(
when: TenantPolicyPack["rules"][number]["when"],
ctx: { node: DSLNode; manifest: NodeManifest; nodeOut: Classification }
): boolean {
const { manifest, nodeOut } = ctx;

if (when.dataContains?.length) {
const ok = when.dataContains.some(c => rank[nodeOut] >= rank[c]); // contains-at-least
if (!ok) return false;
}
if (when.nodeType && when.nodeType !== manifest.type) return false;
if (when.nodeCategory && when.nodeCategory !== manifest.category) return false;

if (when.egress && when.egress !== manifest.capabilities.egress) return false;
if (when.writes && when.writes !== manifest.capabilities.writes) return false;
if (typeof when.deletes === "boolean" && when.deletes !== manifest.capabilities.deletes) return false;
if (typeof when.privilegedAccess === "boolean" && when.privilegedAccess !== manifest.capabilities.privilegedAccess) return false;

// networkDomainMatches would require you to know the domain in config; optional

return true;
}

function maxAllowedRank(consumes: Set<Classification>): number {
let m = 0;
for (const c of consumes) m = Math.max(m, rank[c]);
return m;
}

5. ExecutionPlan — estructura (lo que corre el runner con controles inyectados)

Diseño clave
• ExecutionPlan es linealizable para el runner: lista de steps con deps.
• Mantén nodeId + type + resolvedConfig.
• Incluye:
• controls[] (ya calculados)
• classification in/out
• retry/timeout (desde manifest + overrides)
• referencias a secrets sin exponerlos

execution-plan.schema.json (estructura recomendada)

{
"$id": "https://skuldbot.dev/schemas/execution-plan.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
"title": "SkuldBot ExecutionPlan",
"type": "object",
"required": ["planVersion", "run", "steps"],
"additionalProperties": false,
"properties": {
"planVersion": { "type": "string", "minLength": 1 },
"run": {
"type": "object",
"required": ["runId", "tenantId", "botId", "botVersion", "startedAt"],
"additionalProperties": false,
"properties": {
"runId": { "type": "string", "minLength": 1 },
"tenantId": { "type": "string", "minLength": 1 },
"botId": { "type": "string", "minLength": 1 },
"botVersion": { "type": "string", "minLength": 1 },
"startedAt": { "type": "string", "format": "date-time" }
}
},
"steps": {
"type": "array",
"minItems": 1,
"items": { "$ref": "#/$defs/step" }
}
},
"$defs": {
"classification": { "type": "string", "enum": ["UNCLASSIFIED", "PII", "PHI", "PCI", "CREDENTIALS"] },
"retryPolicy": {
"type": "object",
"required": ["max", "backoffMs"],
"additionalProperties": false,
"properties": {
"max": { "type": "integer", "minimum": 0, "maximum": 50 },
"backoffMs": { "type": "integer", "minimum": 0, "maximum": 3600000 }
}
},
"step": {
"type": "object",
"required": ["stepId", "nodeId", "type", "deps", "resolvedConfig", "controls", "classification", "runtime"],
"additionalProperties": false,
"properties": {
"stepId": { "type": "string", "minLength": 1 },
"nodeId": { "type": "string", "minLength": 1 },
"type": { "type": "string", "minLength": 3 },
"deps": {
"type": "array",
"items": { "type": "string", "minLength": 1 },
"uniqueItems": true
},
"resolvedConfig": { "type": "object", "additionalProperties": true },

        "controls": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "uniqueItems": true
        },

        "classification": {
          "type": "object",
          "required": ["in", "out"],
          "additionalProperties": false,
          "properties": {
            "in": { "$ref": "#/$defs/classification" },
            "out": { "$ref": "#/$defs/classification" }
          }
        },

        "runtime": {
          "type": "object",
          "required": ["idempotent", "retry", "timeoutMs"],
          "additionalProperties": false,
          "properties": {
            "idempotent": { "type": "boolean" },
            "retry": { "$ref": "#/$defs/retryPolicy" },
            "timeoutMs": { "type": "integer", "minimum": 1000, "maximum": 86400000 }
          }
        },

        "outputs": {
          "type": "object",
          "additionalProperties": true,
          "description": "Populated at runtime by runner; optional in plan"
        }
      }
    }

}
}

6. Cómo se conecta todo en tu pipeline (1:1 con tu DSL)

Build (Studio) 1. BotDSL → valida schema básico 2. propagateClassification(dsl, manifests, varDefs, injected?) 3. evaluatePolicies(dsl, manifests, classMap, tenantPolicyPack) 4. Si blocks.length > 0 → no build 5. injectControls (invisible/visible) 6. Re-propagate (si transform puede bajar clasificación) 7. compileExecutionPlan:
• topological order de nodos
• resolvedConfig (eval de expresiones + secrets refs)
• controls[] (set final)
• runtime from manifest

⸻

Si quieres, te lo cierro con “compileExecutionPlan” pseudo-código

Dímelo y te lo escribo tal cual (dep order + children nodes + try/catch + loop).

⸻

Último detalle (para que mañana funcione)

Tú ahora tienes DSLNode.outputs: { success: string; error: string; }.
Eso sugiere que tus edges están implícitos por “outputs handles”.

✅ Te recomiendo modelar edges explícitos en el IR (aunque sea internamente) para:
• topo sort
• policy propagation
• evidence pack consistente

Pero no es obligatorio; lo puedes derivar.

⸻

Si me confirmas una sola cosa:
• ¿Tus container nodes (control.if, try_catch, loop) ya guardan sus conexiones como children[] + handles?
Te ajusto el topoSort + propagation para que respete scopes (muy importante para try/catch y loops).

Perfecto. Con eso ya puedo ajustar topoSort + propagation para tu DSL real (handles success/error/done, children[], scopes por container, loops sin ciclos infinitos, y try/catch heredando clasificación).

Voy a darte: 1. Modelo de grafo “expandido” (para compilar y ordenar sin romper scopes) 2. TopoSort por bloques (containers como sub-DAGs con “puertos”) 3. Propagation con scopes (variables tipo ${item} solo dentro del loop) 4. Try/Catch (catch hereda clasificación del try + error path) 5. Loops (propagación por fixed-point acotado)

⸻

1. Representación interna recomendada: “Block Graph” con puertos

Tu DSL ya tiene lo necesario. Internamente, compila a esto:
• Cada DSLNode es un block si tiene children[] (container)
• Cada block tiene ports (handles):
• success, error, y para containers done (y otros si existen)
• Dentro del block hay un subgrafo de children.

Función clave

buildBlockIR(dslRoot) produce:

type Port = "success" | "error" | "done";

type NodeRef = { id: string }; // existing DSL id

type Edge = { from: string; port: Port; to: string | "END" };

type Block = {
id: string;
type: string;
config: any;
children: Array<Block | Leaf>; // recursively
edges: Edge[]; // derived from outputs handles inside this scope
ports: { success?: string|"END"; error?: string|"END"; done?: string|"END" };
}

type Leaf = {
id: string;
type: string;
config: any;
ports: { success?: string|"END"; error?: string|"END" };
}

Regla: outputs.success/error/done siempre referencian IDs del mismo scope (o END).
Si en UI permites salir del container a un nodo externo, entonces durante serialización debes convertir eso en done del container, no en un child apuntando afuera.

2. TopoSort “por scope” (containers como subprogramas)

No intentes topological sort del grafo completo con loops/catch. Hazlo por niveles:

compileSteps(block, parentScope)

Devuelve una lista de steps (ExecutionPlan) en orden ejecutable, y metadatos de control (jump tables). En pocas palabras:
• Para nodos normales: steps lineales con deps
• Para containers: steps del container + steps de children + un “control step” que decide saltos

2.1 Orden dentro de un scope sin loops

Para un scope (lista de nodes) que sea DAG, topological sort normal.

Pero tú tienes handles success/error, que en realidad forman un control-flow graph (CFG). CFG no siempre es DAG (por loops). Por eso:

✅ Para execution plan, no necesitas topo sort estricto; necesitas orden de emisión + deps.

Orden recomendado:
• Recorrido desde el entry siguiendo success y metiendo error como ramas.
• Para nodos no visitados alcanzables, también los emites.

Pseudo:

function emitOrderFromEntry(entryId, nodesById): string[] {
const order: string[] = [];
const seen = new Set<string>();
const stack = [entryId];

while (stack.length) {
const id = stack.pop()!;
if (id === "END" || seen.has(id)) continue;
seen.add(id);
order.push(id);

    const n = nodesById[id];
    // push error branch too so it's included
    if (n.outputs?.error) stack.push(n.outputs.error);
    if (n.outputs?.success) stack.push(n.outputs.success);
    // for containers, 'done' is continuation outside, handled at parent

}
return order;
}

Esto te da un orden estable para compilar steps y asignar deps (si los quieres).
Para el runner, tú ejecutas siguiendo jump table, no por deps topológicos.

⸻

3. Scopes de variables: stack de “ScopeContext”

Tú quieres algo tipo ${item} válido solo dentro de control.loop.

Hazlo así:

type ScopeContext = {
scopeId: string; // container id
vars: Record<string, VarInfo>; // vars visibles en este scope
};

type VarInfo = { classification?: Classification; type?: string };

type ScopeStack = ScopeContext[];

Reglas
• Siempre existe scope global con dsl.variables
• En control.loop, empujas un scope:
• define item (y/o index) como variables locales
• su classification inicial = classification del dataset/collection que estás iterando
• En control.try_catch, el try y el catch comparten el scope padre, pero el catch puede tener variables error locales.

Resolver de expresiones con scope

Tu extractor de refs debe recibir el stack y resolver:
• ${item.foo} solo si item está en el scope stack
• vars.x siempre en global
• node("X").outputs... siempre (pero ojo: node X debe estar ejecutado antes en ese path; para compile-time basta con permitirlo y luego validar reachability si quieres)

⸻

4. Classification propagation con containers y try/catch

4.1 Qué quieres lograr
• Propagar clasificación “a través” del control flow.
• catch hereda clasificación del try (porque maneja fallos del mismo dato).
• Loops no deben colgarse: usar convergencia acotada.

4.2 Propagación en CFG (no DAG)

En vez de topo pass, usa dataflow analysis (estilo compiladores):
• IN[n] = join(OUT[p]) para todos los predecesores p
• OUT[n] = transfer(n, IN[n])

Con join = max por rank.

Construcción de predecesores

Dentro de un scope:
• si A.success -> B, entonces A es pred de B
• si A.error -> C, entonces A es pred de C
• si control.try_catch:
• edge implícito: TRY block nodes on error → CATCH entry
• si control.loop:
• edges del loop body pueden volver al entry del body (según tu modelo); para propagación, esto crea ciclo (ok)

Algoritmo: Worklist con límite

function propagateCFG(scopeNodes, scopeEdges, manifests, scopeStack): ClassMap {
init IN/OUT a UNCLASSIFIED
push all nodes into queue
iter = 0
while queue not empty and iter < MAX_ITERS:
n = queue.pop()
newIN = join(OUT[p] for p in preds[n]) + inferFromConfig(n, scopeStack)
newOUT = transfer(n, newIN)
if newOUT != OUT[n] or newIN != IN[n]:
IN[n]=newIN; OUT[n]=newOUT
push succs[n] into queue
iter++
return IN/OUT
}

MAX_ITERS: 5k o nodes\*20 (suficiente).
En la práctica converge rápido por ser “max” monotónico.

5. Transfer function por tipo de container

5.1 Nodos normales

Como ya te pasé: out depende de manifest.propagation.

5.2 control.try_catch

Trátalo como un “supernodo” con 2 subscopes:
• TRY scope: childrenTry[]
• CATCH scope: childrenCatch[] (si lo separas) o children[] con marcador

Como tu DSL hoy tiene children[] sin distinguir, necesitas en config del try/catch:
• tryEntryId, catchEntryId (o un “region mapping”)
Si no lo tienes aún, créalo ya; si no, no puedes saber dónde empieza catch.

Propagación lógica
• El IN[tryEntry] = IN[container]
• Corre propagateCFG en TRY
• Define tryOutMax = join de OUT de todos los exit nodes del TRY (los que van a done/success del container)
• Para CATCH:
• IN[catchEntry] = join( IN[container], tryOutMax ) ✅ esto es “catch hereda”
• además, define variable local error como tryOutMax (o PHI si quieres conservador)
• Corre propagateCFG en CATCH
• OUT[container] = join( outTryDone, outCatchDone ) (lo que salga por done)

5.3 control.loop / control.while

No calcules “out” por iteración. Haz dataflow con ciclo:
• IN[bodyEntry] = join( IN[container], OUT[lastBodyExit] )
(lastBodyExit = nodes que vuelven al bodyEntry en cada iteración)
• Al final:
• OUT[container] = OUT de los exit nodes del loop que van a done

Scope variables:
• item classification = classification del dataset/collection que alimenta el loop (si no lo sabes, usa IN[container]).

⸻

6. Ajuste específico para tu “done handle”

Para containers que tienen done, modela done como un puerto del container que se conecta a un nodo del scope padre.

En propagación:
• OUT[container] se propaga al sucesor de done en el padre.
• Dentro del container, los nodes “exit” son los que apuntan a END (del scope interno) o a un pseudo-target **DONE**.

Recomendación: en compile interno, traduce done a un pseudo node **DONE**(containerId) para simplificar preds/succs.

⸻

7. Pseudo-código final: propagation respetando scopes (resumen)

function propagateAll(dsl: BotDSL, manifests, policyInjectedControls): NodeClassInfoMap {
const globalScope = makeGlobalScope(dsl.variables);
const result = new Map<string, {in:Cls; out:Cls}>();

function propagateScope(nodes: DSLNode[], scopeStack: ScopeStack, entryId: string): { exitsOut: Cls } {
const cfg = buildCFG(nodes); // includes success/error edges
const { IN, OUT } = propagateCFG(cfg, manifests, scopeStack, policyInjectedControls);

    // store node results
    for (const id of cfg.nodeIds) result.set(id, { in: IN[id], out: OUT[id] });

    // exit classification: join of nodes that exit this scope (END or DONE)
    return { exitsOut: joinExits(cfg, OUT) };

}

function propagateNode(node: DSLNode, scopeStack: ScopeStack, inbound: Cls): Cls {
if (!node.children?.length) {
const out = transferLeaf(node, inbound, scopeStack);
result.set(node.id, { in: inbound, out });
return out;
}

    // container
    if (node.type === "control.loop" || node.type === "control.while") {
      const loopScope = pushLoopScope(scopeStack, node, inbound); // defines item/index
      const entry = getContainerEntry(node); // from config
      const { exitsOut } = propagateScope(node.children, loopScope, entry);
      result.set(node.id, { in: inbound, out: exitsOut });
      return exitsOut;
    }

    if (node.type === "control.try_catch") {
      const { tryChildren, catchChildren, tryEntry, catchEntry } = splitTryCatch(node);
      const tryOut = propagateScope(tryChildren, scopeStack, tryEntry).exitsOut;

      const catchScope = pushCatchScope(scopeStack, tryOut); // defines error variable
      const catchOut = propagateScope(catchChildren, catchScope, catchEntry).exitsOut;

      const out = maxClass(tryOut, catchOut);
      result.set(node.id, { in: inbound, out });
      return out;
    }

    // control.if: propagate both branches, then join
    if (node.type === "control.if") {
      const { thenChildren, elseChildren, thenEntry, elseEntry } = splitIf(node);
      const thenOut = propagateScope(thenChildren, scopeStack, thenEntry).exitsOut;
      const elseOut = propagateScope(elseChildren, scopeStack, elseEntry).exitsOut;
      const out = maxClass(thenOut, elseOut);
      result.set(node.id, { in: inbound, out });
      return out;
    }

    // default container: treat as pass-through sub-scope
    const entry = getContainerEntry(node);
    const out = propagateScope(node.children, scopeStack, entry).exitsOut;
    result.set(node.id, { in: inbound, out });
    return out;

}

// Root propagation: build root CFG (top-level nodes)
// Use dataflow CFG over top-level + treat containers as transfer nodes whose out depends on children (computed above).
// Easiest: iterative solve at top level too: treat container OUT as unknown until children solved; repeat until convergence.
propagateRootWithFixpoint(dsl.nodes, globalScope, propagateNode, result);

return Object.fromEntries(result);
}

8. IMPORTANT: necesitas “entryId” por container

Para que esto sea sólido, cada container debe tener (en config):
• entry: id del primer child o “start” node interno
• para if/try:
• thenEntry, elseEntry
• tryEntry, catchEntry
Si hoy no lo tienes, añádelo; es una mejora mínima y te simplifica todo.

⸻

Si quieres que lo deje cerradísimo

Te puedo dar buildCFG() exacto para tu DSL con:
• puertos success/error/done
• pseudo nodes **DONE**, **END**
• separación de regiones de try/catch e if

Pero para eso necesito saber cómo distingues en children[] cuáles pertenecen a then vs else y try vs catch.
Si ya lo tienes (aunque sea con config.regionMap o child.parentHandle), dímelo y te lo ajusto.

Me quedo con una tercera opción (mejor que A y B) y, si tienes que elegir entre A y B, te digo cuál.

La mejor propuesta: children con metadata de “ports” (scope-aware)

En vez de inventarte regionMap genérico, modela lo que realmente estás construyendo en React Flow:
• el container tiene puertos internos (then, else, try, catch, body)
• cada hijo pertenece a un puerto (región) y tiene un “entry”

Opción C (recomendada): children como “scoped children”

interface DSLNode {
id: string;
type: string;
config: Record<string, any>;
outputs: { success: string; error: string; done?: string };
children?: DSLNode[];

// NUEVO
scope?: {
ports: {
[portName: string]: {
nodeIds: string[]; // children IDs in this region
entryId: string; // first node in region
}
}
}
}

Por qué es superior a A/B:
• te obliga a definir entryId (sin eso tu CFG siempre será ambiguo)
• soporta nuevos containers en el futuro (switch, parallel, map/reduce) sin cambiar el modelo
• no duplicas estado (B tiende a duplicar y desincronizar)
• es fácil de construir desde React Flow: cada edge hacia el container con handle then/else/... define región y entry

⸻

Si tienes que escoger entre A vs B hoy

Prefiero B (region en cada child), pero con dos añadidos: 1. parentRegion en cada child 2. regionEntryId en el container (o detectarlo por edges)

Porque:
• regionMap (A) es frágil: mantienes arrays de IDs que se desincronizan cuando mueves nodos, duplicas, borras, etc.
• Con B la región “vive” con el nodo, y el árbol se mantiene consistente.

B mejorado (mínimo)

interface DSLNode {
id: string;
type: string;
config: Record<string, any>;
outputs: { success: string; error: string; done?: string };
children?: DSLNode[];

parentRegion?: "then" | "else" | "try" | "catch" | "body";
}

// En el container:
config: {
regionEntry?: {
then?: string;
else?: string;
try?: string;
catch?: string;
body?: string;
}
}

Cómo cambia tu buildCFG() con Opción C (o B mejorado)

1. Construye CFG por scope/port

Para un container:
• separas children por región usando scope.ports[port].nodeIds (o parentRegion)
• construyes un CFG para cada región
• defines edges implícitos:
• if: entrada eval → then.entry / else.entry
• try_catch: try.entry; errores del try → catch.entry
• loop: body.entry con back-edge controlado (para dataflow analysis)

2. Entry y Exits quedan claros

Cada región tiene:
• entryId
• exitNodes (los que van a END / DONE internos)

Con eso:
• classification propagation converge
• compileExecutionPlan tiene jump table correcto
• evidence pack puede reportar “branch taken”

⸻

Recomendación práctica para tu estado actual (sin romper todo)

Como hoy else y catch viven fuera del container y dependen de error handle del container:

✅ Puedes migrar en 2 fases:

Fase 1 (ya): añade scope pero úsalo opcionalmente
• control.if sigue como “then-only”
• control.try_catch sigue “try-only”
• scope solo para loops (body) al principio

Fase 2: añade regiones reales
• if con then/else
• try_catch con try/catch

Esto te permite evolucionar sin reescribir.

⸻

Decisión final (para tu pregunta)
• Mejor opción: C (scope.ports con entryId)
• Si quieres elegir entre A y B: B (region por child) + entryIds en el container
• Evitaría A salvo que tengas muy poco movimiento de nodos (porque se rompe fácil con drag/drop).

⸻

Si quieres, te dejo el buildCFG() pseudo-código exacto para: 1. tu modelo actual (then-only, try-only, loop body) 2. el modelo evolucionado con scope.ports

Dime cuál de los dos vas a implementar primero (actual + incremental, o te lanzas directo con regiones completas).

Perfecto. Te dejo el diseño completo “tipo compilador” para tu DSL con Opción C y soporte a todos esos containers. Voy a ser deliberadamente preciso para que lo implementes en NestJS/TS sin adivinar nada.

Abarco: 1. buildCFG() con pseudo-nodes **ENTRY**, **END**, **DONE** 2. topoSort() que respeta scopes (y no se rompe con loops) 3. propagateClassification() (dataflow worklist) con:
• try → catch
• then/else independientes + join
• loop fixed-point
• parallel + switch

⸻

0. Tipos base

type Port = string; // "success" | "error" | "done" | "then" | "else" | "try" | "catch" | "body" | "case_x" | "default" | "branch_0"...

type PseudoId = "**ENTRY**" | "**END**" | "**DONE**";

type Edge = { from: string; fromPort: Port; to: string; };

type CFG = {
nodeIds: Set<string>; // includes real nodeIds + pseudo nodes per scope
edges: Edge[];
succ: Map<string, Set<string>>;
pred: Map<string, Set<string>>;
scopeOf: Map<string, string>; // nodeId -> scopeId (containerId or "ROOT")
containers: Map<string, DSLNode>; // containerId -> node
nodesById: Map<string, DSLNode>; // real nodes only (not pseudo)
entryId: string; // scope entry pseudo node id
endId: string; // scope end pseudo node id
doneId?: string; // if scope has done
};

Helper: pseudo IDs per scope

No uses un **ENTRY** global; crea IDs por scope para no colisionar.

function ENTRY(scopeId: string) { return `__ENTRY__:${scopeId}`; }
function END(scopeId: string) { return `__END__:${scopeId}`; }
function DONE(scopeId: string) { return `__DONE__:${scopeId}`; }

1. buildCFG() completo (con scopes y puertos)

1.1 Reglas de conexión (lo más importante)

Nodos leaf
• node.outputs.success -> target
• node.outputs.error -> target
Si el target es "END", conectas a END(scope).

Containers

Los containers tienen:
• scope.ports[portName].entryId (entry real dentro del container)
• y pueden tener outputs.done para continuar fuera.

Conexiones implícitas por tipo:

control.if (then/else)
• **ENTRY** -> ifNode (dentro del scope padre)
• ifNode decide:
• ifNode (then) -> entry(then)
• ifNode (else) -> entry(else)
• exits:
• cualquier leaf/container dentro de then/else que vaya a "END" del subscope, en realidad va a DONE(container) (o END(container) interno), y de ahí a outputs.done del container (o success si usas esa semántica)

control.try_catch (try/catch)
• try_catchNode (try) -> entry(try)
• errores dentro del try:
• cualquier edge error que vaya a "END" del try-scope (o no esté manejado) se redirige a entry(catch) (implícito)
• exits:
• try normal exit -> DONE(container)
• catch exit -> DONE(container)

control.loop y control.while (body)
• loopNode -> entry(body)
• exit normal del body -> back-edge a loopNode (siguiente iteración) o a entry(body) (depende de tu runner)
• para CFG analysis, lo representamos como DONE(bodyScope) -> entry(bodyScope) (back-edge)
• salida del loop hacia afuera:
• loopNode.done -> targetOutside (o END del parent)

control.switch (case_x, default)
• switchNode -> entry(case_x) por cada case (implícito)
• switchNode -> entry(default) si existe
• exits de cualquier case/default -> DONE(container)

control.parallel (branch_0..n)
• parallelNode -> entry(branch_i) para cada branch
• exits de branch_i -> join en DONE(container) (es un join barrier)
• DONE(container) -> outputs.done afuera

⸻

1.2 Construcción por scopes (recursivo)

Implementa un builder que construye CFG por scope y los “embed” en el grafo global.

buildCFG(dslRootNodes)

function buildCFG(rootNodes: DSLNode[]): CFG {
const nodesById = new Map<string, DSLNode>();
const containers = new Map<string, DSLNode>();
indexNodes(rootNodes, nodesById, containers);

const scopeOf = new Map<string, string>();
const edges: Edge[] = [];

// Build ROOT scope pseudo nodes
const rootScopeId = "ROOT";
const rootEntry = ENTRY(rootScopeId);
const rootEnd = END(rootScopeId);

// add pseudo nodes
const nodeIds = new Set<string>([rootEntry, rootEnd]);

// attach scope info
scopeOf.set(rootEntry, rootScopeId);
scopeOf.set(rootEnd, rootScopeId);

// Assign scopeOf for real nodes (root level initially)
for (const n of rootNodes) assignScope(n, rootScopeId, scopeOf);

// Add edges for ROOT entry to first nodes (if you have triggers, pick entry nodes from triggers list)
// Here assume you have an implicit "entry" list; else take all triggers or all roots with no predecessors.
const entryNodes = pickRootEntryNodes(rootNodes); // you define
for (const id of entryNodes) edges.push({ from: rootEntry, fromPort: "success", to: id });

// Build edges within ROOT scope (handles success/error/done)
buildScopeEdges(rootScopeId, rootNodes, edges, scopeOf, nodesById);

// Now recurse: for each container in ROOT, build its internal scope CFG and connect via implicit region edges.
for (const n of rootNodes) {
if (n.children?.length) buildContainerScopes(n, edges, scopeOf, nodesById, nodeIds);
nodeIds.add(n.id);
}

// Finally compute succ/pred maps
const { succ, pred } = computeAdjacency(edges);

// Ensure nodeIds contains all ids appearing in edges
for (const e of edges) { nodeIds.add(e.from); nodeIds.add(e.to); }

return {
nodeIds,
edges,
succ,
pred,
scopeOf,
containers,
nodesById,
entryId: rootEntry,
endId: rootEnd
};
}

Index and scope assignment

function indexNodes(nodes: DSLNode[], nodesById: Map<string, DSLNode>, containers: Map<string, DSLNode>) {
for (const n of nodes) {
nodesById.set(n.id, n);
if (n.children?.length) containers.set(n.id, n);
if (n.children?.length) indexNodes(n.children, nodesById, containers);
}
}

function assignScope(node: DSLNode, scopeId: string, scopeOf: Map<string,string>) {
scopeOf.set(node.id, scopeId);
if (node.children?.length) {
// children belong to this container scope (containerId)
for (const ch of node.children) assignScope(ch, node.id, scopeOf);
}
}

Build edges for a flat list in a scope

This uses outputs.success/error/done. "END" maps to END(scopeId).

function buildScopeEdges(scopeId: string, nodes: DSLNode[], edges: Edge[], scopeOf: Map<string,string>, nodesById: Map<string,DSLNode>) {
const endId = END(scopeId);
// ensure pseudo nodes exist via later nodeIds fill; ok
for (const n of nodes) {
// success
if (n.outputs?.success) {
edges.push({
from: n.id,
fromPort: "success",
to: n.outputs.success === "END" ? endId : n.outputs.success
});
}
// error
if (n.outputs?.error) {
edges.push({
from: n.id,
fromPort: "error",
to: n.outputs.error === "END" ? endId : n.outputs.error
});
}
// done (only containers typically)
if (n.outputs?.done) {
edges.push({
from: n.id,
fromPort: "done",
to: n.outputs.done === "END" ? endId : n.outputs.done
});
}
}
}

Build container scopes and implicit region edges

This is the core.

function buildContainerScopes(
container: DSLNode,
edges: Edge[],
scopeOf: Map<string,string>,
nodesById: Map<string,DSLNode>,
nodeIds: Set<string>
) {
const cId = container.id;

// create pseudo nodes for container scope
const cEntry = ENTRY(cId);
const cEnd = END(cId);
const cDone = DONE(cId);

nodeIds.add(cEntry); nodeIds.add(cEnd); nodeIds.add(cDone);
scopeOf.set(cEntry, cId); scopeOf.set(cEnd, cId); scopeOf.set(cDone, cId);

// connect container node to its internal entry pseudo (optional but useful for analysis)
edges.push({ from: container.id, fromPort: "enter", to: cEntry });

// build internal edges among children based on their outputs
buildScopeEdges(cId, container.children ?? [], edges, scopeOf, nodesById);

// map any "END" inside this container scope to cDone (NOT cEnd) because exiting region means "container completed"
// Easiest: after edges are built, rewrite edges whose `to` is END(cId) into cDone.
rewriteScopeEndToDone(cId, edges);

// Now, implicit edges between container and region entries
const ports = container.scope?.ports ?? {};
function portEntry(portName: string): string | null {
const p = ports[portName];
if (!p) return null;
return p.entryId || null;
}

switch (container.type) {
case "control.if": {
const thenEntry = portEntry("then");
const elseEntry = portEntry("else");
if (thenEntry) edges.push({ from: container.id, fromPort: "then", to: thenEntry });
if (elseEntry) edges.push({ from: container.id, fromPort: "else", to: elseEntry });
// When container completes, flow continues via outputs.done or outputs.success (you choose; you said containers have done)
edges.push({ from: cDone, fromPort: "done", to: container.outputs.done ?? container.outputs.success ?? END(scopeOf.get(container.id)!) });
break;
}

    case "control.try_catch": {
      const tryEntry = portEntry("try");
      const catchEntry = portEntry("catch");
      if (tryEntry) edges.push({ from: container.id, fromPort: "try", to: tryEntry });
      // redirect any unhandled error in try-scope to catchEntry
      if (catchEntry) {
        redirectTryErrorsToCatch(container, catchEntry, edges, scopeOf);
        edges.push({ from: container.id, fromPort: "catch", to: catchEntry }); // optional for analysis
      }
      edges.push({ from: cDone, fromPort: "done", to: container.outputs.done ?? container.outputs.success ?? END(scopeOf.get(container.id)!) });
      break;
    }

    case "control.loop":
    case "control.while": {
      const bodyEntry = portEntry("body");
      if (bodyEntry) edges.push({ from: container.id, fromPort: "body", to: bodyEntry });
      // loop back-edge: when body scope exits -> back to bodyEntry (next iteration)
      if (bodyEntry) edges.push({ from: cDone, fromPort: "iterate", to: bodyEntry });
      // and also allow loop to finish via container.outputs.done (your runner decides exit condition)
      edges.push({ from: container.id, fromPort: "done", to: container.outputs.done ?? END(scopeOf.get(container.id)!) });
      break;
    }

    case "control.switch": {
      for (const k of Object.keys(ports)) {
        if (k.startsWith("case_") || k === "default") {
          const e = portEntry(k);
          if (e) edges.push({ from: container.id, fromPort: k, to: e });
        }
      }
      edges.push({ from: cDone, fromPort: "done", to: container.outputs.done ?? container.outputs.success ?? END(scopeOf.get(container.id)!) });
      break;
    }

    case "control.parallel": {
      for (const k of Object.keys(ports)) {
        if (k.startsWith("branch_")) {
          const e = portEntry(k);
          if (e) edges.push({ from: container.id, fromPort: k, to: e });
        }
      }
      // join barrier: branches exit -> cDone (already via rewrite of END->DONE)
      edges.push({ from: cDone, fromPort: "done", to: container.outputs.done ?? container.outputs.success ?? END(scopeOf.get(container.id)!) });
      break;
    }

    default: {
      // generic container: treat as body
      const bodyEntry = portEntry("body");
      if (bodyEntry) edges.push({ from: container.id, fromPort: "body", to: bodyEntry });
      edges.push({ from: cDone, fromPort: "done", to: container.outputs.done ?? container.outputs.success ?? END(scopeOf.get(container.id)!) });
    }

}

// recurse into nested containers
for (const ch of (container.children ?? [])) {
nodeIds.add(ch.id);
if (ch.children?.length) buildContainerScopes(ch, edges, scopeOf, nodesById, nodeIds);
}
}

function rewriteScopeEndToDone(scopeId: string, edges: Edge[]) {
const end = END(scopeId);
const done = DONE(scopeId);
for (const e of edges) {
if (e.to === end) e.to = done;
}
}

Redirect try errors to catch

This is what makes “try propagates to catch” correct.

function redirectTryErrorsToCatch(container: DSLNode, catchEntry: string, edges: Edge[], scopeOf: Map<string,string>) {
// In your model, nodes inside TRY region will have error edges.
// We want: if an error edge goes to DONE(scope) (meaning "unhandled") -> send to catchEntry.
// That assumes try-scope exits were rewritten to DONE(containerId). For region-level try/catch you likely want done per region,
// but simplest: treat all child nodes in try region as belonging to container scope and use an explicit region scoping.
// With Opción C, you can identify try nodeIds list and only rewrite those.

const tryIds = new Set(container.scope?.ports?.["try"]?.nodeIds ?? []);
const cDone = DONE(container.id);

for (const e of edges) {
if (e.fromPort !== "error") continue;
if (!tryIds.has(e.from)) continue;
// if error goes to container done (meaning unhandled within try), redirect to catch entry
if (e.to === cDone) {
e.to = catchEntry;
}
}
}

Nota importante: Para try/catch real y limpio, conviene que cada región tenga su propio END/DONE (ej: **DONE**:container:try).
Pero con tu estructura actual (un solo children[]), lo anterior funciona si usas scope.ports.try.nodeIds como filtro.

2. topoSort() “que respete scopes”

En control-flow (con loops), el topoSort “puro” no existe (ciclos). Lo que necesitas es:
• SCC condensation DAG (Kahn sobre componentes) para:
• orden de análisis
• orden de compilación
• dentro de un SCC (loop), usas el worklist de dataflow.

topoSortScopes(cfg)
• Construye SCCs (Tarjan / Kosaraju)
• Contrae SCCs a super-nodos
• Kahn sobre DAG resultante

Pseudo:

function topoSort(cfg: CFG): string[] {
const sccs = tarjanSCC(cfg.succ, cfg.nodeIds);
const { dagSucc, indeg } = buildCondensationDag(sccs, cfg.succ);

const q: string[] = [];
for (const compId of dagSucc.keys()) if ((indeg.get(compId) ?? 0) === 0) q.push(compId);

const compOrder: string[] = [];
while (q.length) {
const c = q.shift()!;
compOrder.push(c);
for (const nx of (dagSucc.get(c) ?? [])) {
indeg.set(nx, (indeg.get(nx) ?? 0) - 1);
if ((indeg.get(nx) ?? 0) === 0) q.push(nx);
}
}

// Expand comps into node order: stable within SCC by DFS from entry (optional)
const order: string[] = [];
for (const compId of compOrder) {
const nodes = sccs.get(compId)!;
for (const id of stableOrderWithinComp(nodes, cfg)) order.push(id);
}
return order;
}

Con esto respetas scopes porque scopeOf te permite excluir pseudo nodes o analizarlos primero, y containers quedan dentro del mismo SCC si hay back-edge.

3. propagateClassification() con regiones y containers

Aquí sí se aplica dataflow.

3.1 Principio

Haces un IN/OUT por nodo real y por pseudo nodes (ENTRY/DONE) si quieres; yo recomiendo:
• ENTRY(scope) tiene IN = del predecessor outside
• DONE(scope) out = join de exits del scope

Join operator

join = maxClass

Transfer operator

OUT[node] = transfer(node, IN[node]) (según NodeManifest + controles)

⸻

3.2 Dataflow worklist general

Funciona incluso con loops y parallel.

function propagateClassification(cfg: CFG, manifests: Record<string, NodeManifest>, injectedControls: Record<string,string[]>): Record<string,{in:Cls; out:Cls}> {
const IN: Record<string,Cls> = {};
const OUT: Record<string,Cls> = {};

for (const id of cfg.nodeIds) { IN[id] = "UNCLASSIFIED"; OUT[id] = "UNCLASSIFIED"; }

const q: string[] = Array.from(cfg.nodeIds); // init all
const MAX = cfg.nodeIds.size \* 30;

let iter = 0;
while (q.length && iter < MAX) {
iter++;
const n = q.shift()!;
const preds = cfg.pred.get(n) ?? new Set<string>();

    // compute new IN
    let newIn: Cls = "UNCLASSIFIED";
    for (const p of preds) newIn = maxClass(newIn, OUT[p]);

    // (optional) add inferFromConfig refs based on current scope vars
    newIn = maxClass(newIn, inferFromConfigWithScopes(n, cfg, manifests));

    // transfer
    const newOut = transfer(n, newIn, cfg, manifests, injectedControls);

    const changed = (newIn !== IN[n]) || (newOut !== OUT[n]);
    IN[n] = newIn;
    OUT[n] = newOut;

    if (changed) {
      for (const s of (cfg.succ.get(n) ?? new Set<string>())) q.push(s);
    }

}

// return only real nodes (exclude pseudo if you want)
const res: Record<string,{in:Cls; out:Cls}> = {};
for (const [id, node] of cfg.nodesById.entries()) res[id] = { in: IN[id], out: OUT[id] };
return res;
}

3.3 Transfer() que maneje containers (key)

Para leaf node: as you already had.

Para container nodes: su OUT debe ser el OUT del DONE(containerId) (porque done ya es join de exits de sus regiones). Como ya construimos rewrite END->DONE, eso ocurre automáticamente: DONE(containerId) recibirá preds desde todos los exits del container.

Entonces:

function transfer(id: string, inC: Cls, cfg: CFG, manifests, injected): Cls {
// pseudo nodes: by default pass-through
if (id.startsWith("**ENTRY**") || id.startsWith("**DONE**") || id.startsWith("**END**")) return inC;

const node = cfg.nodesById.get(id);
if (!node) return inC;

// container node: treat as pass-through; its real effect comes from its internal CFG and DONE barrier
if (node.children?.length) {
// out from container is max(inC, OUT[DONE(containerId)]) ??? Actually OUT[DONE] already depends on internal exits.
// But to avoid circularity, keep container node transfer as inC, and rely on edges from **DONE** to outside.
// In our buildCFG, outside continuation is from **DONE** -> next, NOT from container.id -> next (except explicit done handle on container).
return inC;
}

// leaf: use manifest rules
const manifest = manifests[node.type];
const produces = maxOf(manifest.data.produces, "UNCLASSIFIED");

let out = inC;
switch (manifest.data.propagation) {
case "NONE": out = produces; break;
case "DERIVE": out = produces; break;
case "PASS_THROUGH": out = maxClass(inC, produces); break;
case "TRANSFORM":
out = maxClass(inC, produces);
out = applyTransform(out, injected[id] ?? []);
break;
default:
out = maxClass(inC, produces);
}
return out;
}

Importante: “try propaga a catch”

Eso ya está modelado por redirectTryErrorsToCatch(): errores desde try region se convierten en edges al catchEntry.
Entonces el worklist propagará OUT(try nodes) → IN(catchEntry) automáticamente.

then/else independientes

Como ifNode.then -> thenEntry y ifNode.else -> elseEntry, cada rama tendrá su dataflow.
Los exits de ambas ramas van a **DONE**:ifNode (join barrier).
Luego **DONE** propaga al done outside.

loop body propaga al siguiente ciclo

Como agregamos **DONE**:loop -> bodyEntry, hay ciclo; dataflow converge por monotonic max.

parallel branches

Como los branches salen a **DONE**:parallel (join barrier), **DONE** será join de outs de branches.

switch cases

Todos los case entries conectados desde switchNode. Exits join in done.

⸻

4. Edges implícitos “eval → regions”

En tu CFG, esto ya lo modelamos como edges desde container.id con fromPort then/else/try/... a los entryId de cada región.

Consejo práctico: agrega un nodo pseudo **EVAL**:containerId si quieres diferenciar la evaluación de condición del container. No es requerido, pero ayuda para evidence pack (“which branch selected”).

⸻

5. Un detalle crítico: “fuentes de error”

En try_catch, hay dos fuentes:
• error handle de cada nodo dentro de try
• excepciones runtime no representadas (timeouts, thrown)
Tu runner debe normalizar todo a “error edge” del step. En CFG, asume que todo node tiene error.

Tu policy propagation será conservadora (bien).

⸻

6. Scope variables dentro de loop (tu requirement)

En inferFromConfigWithScopes, cuando estás dentro del control.loop.body port, expone ${item}.

Cómo saber que un node está en “body”:
• con Opción C, container.scope.ports.body.nodeIds te lo dice.
• mantén un regionOfNode: Map<childId, {containerId, portName}> durante buildCFG.

Entonces:
• si regionOfNode.get(nodeId)?.portName === "body" y container.type in (loop/while) → define item en scope resolver.

Esto solo afecta inferFromConfig (para clasificar inputs por refs) y tu runtime resolver (para evaluar expresiones).

⸻

7. Checklist de implementación (para que salga en 1 sprint)
   1. Implementar scope.ports en DSL serialización (desde ReactFlow handles)
   2. Implementar buildCFG() como arriba (con rewrite END->DONE)
   3. Implementar SCC-based topoSort (para análisis/compilación)
   4. Implementar worklist propagation (monotonic)
   5. Añadir regionOfNode para scopes (loop item)
   6. Ajustar policy evaluator para usar OUT por node y for external egress require controls

⸻

Pregunta mínima (para cerrar exacto)

En control.loop / control.while:
¿el done se toma desde el container node (cuando condición falla) o desde el body (un break node)?
• Si es “condición falla”: perfecto como lo modelé (container has done out).
• Si hay “break”: añade un node control.break que haga success -> **DONE**:loop.

Dímelo y te ajusto el edge model con break/continue (super útil para no forzar ciclos en todos los casos).

Perfecto. Con eso cierro el modelo de edges para break/continue sin romper tu estado actual (done desde el container). Te dejo el ajuste completo, incluyendo los nuevos pseudo-nodes y cómo buildCFG() debe reescribir conexiones.

1. Nuevos pseudo-nodes por loop/while

Para cada container control.loop / control.while crea además de:
• **ENTRY**:loopId
• **DONE**:loopId
• **END**:loopId (si lo usas internamente)

agrega:
• **NEXT_ITER**:loopId ✅ (punto de “siguiente iteración”)

Helpers:

function NEXT(scopeId: string) { return `__NEXT_ITER__:${scopeId}`; }

2. Semántica clara (runtime + CFG)

Estado actual (se mantiene)
• El container node decide terminar el loop cuando condición falla / items se agotan:
• loopNode.done -> nextOutside

Nuevo: control.break
• Dentro del body, al ejecutarse:
• sale del loop inmediatamente → va a **DONE**:<loopId> (join/exit del loop)

Nuevo: control.continue
• Dentro del body, al ejecutarse:
• salta a siguiente iteración → va a **NEXT_ITER**:<loopId>
• **NEXT_ITER**:<loopId> debe reconectar al bodyEntry del loop (inicio de iteración)

⸻

3. Puertos/edges implícitos para loop (actualizado)

Para control.loop/control.while: 1. Entrada al body

    •	loopNode (body) -> bodyEntry

    2.	Salida normal del body

    •	Cualquier “END” interno del body (lo que hoy reescribes) va a __NEXT_ITER__:<loopId>

(antes lo mandábamos a **DONE** y luego back-edge; ahora lo hacemos más semántico)

    3.	continue

    •	control.continue.success -> __NEXT_ITER__:<loopId>

    4.	break

    •	control.break.success -> __DONE__:<loopId>

    5.	Siguiente iteración

    •	__NEXT_ITER__:<loopId> -> bodyEntry

    6.	Salir del loop

    •	loopNode.done -> nextOutside (como hoy)

    7.	(Opcional, recomendado) barrier para “done”

    •	Si quieres que el loop “termine” por break también, conecta:
    •	__DONE__:<loopId> -> loopNode.doneTarget

Pero OJO: eso mezclaría “break” con “condición falla” y puede confundir al runner.
Mejor: **DONE**:<loopId> conecte directamente a lo mismo que loopNode.done conecta.

✅ Solución: haz que **DONE**:<loopId> apunte al mismo destino que loopNode.outputs.done.

⸻

4. Cambios exactos en buildContainerScopes() para loops

A) Crear pseudo node NEXT

const cNext = NEXT(cId);
nodeIds.add(cNext);
scopeOf.set(cNext, cId);

B) Conectar **NEXT_ITER** -> bodyEntry

if (bodyEntry) edges.push({ from: cNext, fromPort: "next", to: bodyEntry });

C) Reescribir “END” interno del body a NEXT (no a DONE)

Antes tenías:
• rewriteScopeEndToDone(loopId, edges) ⇒ END -> DONE

Ahora para loops haz:
• END -> NEXT

function rewriteScopeEndToNext(scopeId: string, edges: Edge[]) {
const end = END(scopeId);
const next = NEXT(scopeId);
for (const e of edges) {
if (e.to === end) e.to = next;
}
}

Y dentro de case "control.loop"/"control.while" usa:

rewriteScopeEndToNext(cId, edges);

D) Edge del container a bodyEntry

if (bodyEntry) edges.push({ from: container.id, fromPort: "body", to: bodyEntry });

E) Done externo (se mantiene) + DONE pseudo hacia afuera (para break)

const parentScope = scopeOf.get(container.id)!;
const doneTarget =
container.outputs.done
? (container.outputs.done === "END" ? END(parentScope) : container.outputs.done)
: END(parentScope);

edges.push({ from: container.id, fromPort: "done", to: doneTarget });

// new: break exits to same target
edges.push({ from: DONE(cId), fromPort: "break", to: doneTarget });

5. Reescritura de control.break y control.continue

Esto depende de que el builder sepa el loop container padre del nodo.

Como ya tienes parentId en React Flow y scopeOf en CFG, en DSL también puedes inferirlo:
• un control.break estará dentro de children[] de algún container loop/while (scopeId = that container id)

Regla de buildCFG (post-procesado)

Después de construir edges del scope de un loop, recorre sus children:
• Si child.type === control.break:
• reemplaza su success target por **DONE**:<loopId>
• Si child.type === control.continue:
• reemplaza su success target por **NEXT_ITER**:<loopId>

Pseudo:

function patchBreakContinue(loopContainer: DSLNode, edges: Edge[]) {
const loopId = loopContainer.id;
for (const e of edges) {
if (e.fromPort !== "success") continue;

    if (e.from && isNodeType(e.from, "control.break", loopContainer)) {
      e.to = DONE(loopId);
    }
    if (e.from && isNodeType(e.from, "control.continue", loopContainer)) {
      e.to = NEXT(loopId);
    }

}
}

Mejor aún: al construir edges de cada node, si detectas control.break no uses su outputs.success sino directo DONE(loopId).

⸻

6. Propagación de clasificación con break/continue

No necesitas cambiar el worklist.
• break salta a **DONE** → sale del ciclo
• continue salta a **NEXT_ITER** → mantiene el ciclo

Como todo son edges en CFG, la dataflow converge igual (monótono con max).

⸻

7. Evidence pack (bonus) — exit_reason

Ya que tu control.while tiene exit_reason (“break” preparado):

En runtime, cuando se toma **DONE** por break:
• set exit_reason = "break"

Cuando termina por condición/items:
• exit_reason = "condition_false" o items_exhausted

Eso lo puedes registrar como output del container step.

⸻

8. Schema / NodeManifest para break/continue (mínimo)
   • control.break: container-only, capability none, propagation PASS_THROUGH, but runtime triggers jump.
   • control.continue: idem.

No requieren outputSchema (o solo success).

⸻

Resumen del edge model actualizado (loop/while)
• END(loopScope) → **NEXT_ITER**:loopId
• **NEXT_ITER**:loopId → bodyEntry
• control.continue.success → **NEXT_ITER**:loopId
• control.break.success → **DONE**:loopId
• **DONE**:loopId → doneTargetOutside (mismo que loopNode.done)
• loopNode.done → doneTargetOutside (cuando condición falla)

⸻

Si quieres que te lo deje redondo para implementación: te escribo el bloque completo case "control.loop"/"control.while" de buildContainerScopes() ya con NEXT, rewrite END->NEXT y patch break/continue (en TypeScript).

Perfecto, Dubiel.
Te dejo el modelo final listo para Skuldbot con break / continue, alineado con tu runner y tu DSL.

Esto no es teoría.
Esto es el contrato de ejecución y propagación real para que lo pegues en tu backend.

⸻

🧠 Principio

No propagamos filas, propagamos control.

Los loops funcionan así:

eventos Salida
Se acaba la data / condición false loop.done
Un nodo decide romper el ciclo control.break → **DONE**
Un nodo decide saltar a la siguiente iteración control.continue → **NEXT_ITER**

🔩 Nuevos pseudo-nodos por loop

Para cada control.loop o control.while:

ENTRY(loopId) = "**ENTRY**:" + loopId
DONE(loopId) = "**DONE**:" + loopId
NEXT_ITER(loopId) = "**NEXT_ITER**:" + loopId
END(loopId) = "**END**:" + loopId

🔁 Flujo real de un Loop

Entrada

loopNode ──(body)──► bodyEntry

Salida normal del Body

bodyExit ───────────► **NEXT_ITER**:loopId
**NEXT_ITER**:loopId ───────────────► bodyEntry

control.continue

control.continue.success ───────────► **NEXT_ITER**:loopId

control.break

control.break.success ──────────────► **DONE**:loopId

Terminar el Loop

loopNode.done ──────────────────────► doneTargetOutside
**DONE**:loopId ─────────────────────► doneTargetOutside

🏗️ Ajuste exacto en buildContainerScopes() para loops

case "control.loop":
case "control.while": {

const bodyEntry = ports["body"]?.entryId;
const doneTarget = container.outputs.done ?? END(parentScope);

const cEntry = ENTRY(cId);
const cDone = DONE(cId);
const cNext = NEXT_ITER(cId);

nodeIds.add(cEntry); nodeIds.add(cDone); nodeIds.add(cNext);
scopeOf.set(cEntry, cId); scopeOf.set(cDone, cId); scopeOf.set(cNext, cId);

// Entrar al body
if (bodyEntry) edges.push({ from: container.id, fromPort: "body", to: bodyEntry });

// Salida normal del body vuelve al NEXT
rewriteScopeEndToNext(cId, edges);

// NEXT vuelve a bodyEntry
if (bodyEntry) edges.push({ from: cNext, fromPort: "next", to: bodyEntry });

// Cuando loop termina
edges.push({ from: container.id, fromPort: "done", to: doneTarget });

// Break sale del loop
edges.push({ from: cDone, fromPort: "done", to: doneTarget });

// Continue vuelve al NEXT
patchContinueToNext(container, cNext, edges);

// Break va al DONE
patchBreakToDone(container, cDone, edges);

break;
}

🧠 Propagación de Clasificación (sin cambios)

Tu dataflow engine no se rompe:
• break corta el ciclo → clasificación pasa al DONE y sale
• continue mantiene el ciclo → converge por máximo

No necesitas tocar el propagator.

⸻

🧾 Evidence Pack

Cuando el loop sale por DONE:

{ "exit_reason": "break" }

Cuando sale por condición false / agotado:

{ "exit_reason": "condition_false" }

🎯 Resultado

Con esto tienes:
• Loops cognitivos con control explícito
• Compatible con tu runner
• Compatible con tu modelo de clasificación
• Preparado para regulated industries
• Y listo para integrarse con tu planner y policy engine

Sí — y vamos a hacerlo ya, en serio “final”: un ExecutionPlan compiler que te deje al runner con cero interpretación (solo ejecutar steps y saltar por jumps).

Te lo doy en TypeScript (pegable), con:
• compileExecutionPlan(dsl, manifests, policyPack)
• buildCFG() (usa tu Option C scope.ports)
• propagateClassification()
• evaluatePolicies()
• injectControls()
• compileStepsAndJumps()
• jump targets resueltos a stepId (no nodeId)
• manejo de containers (if/try/switch/parallel/loop/while) como steps ejecutables
• break/continue ya soportado por buildCFG (pero runner no necesita conocer pseudo nodes)

Nota: el runner sigue un contrato simple:
nextStepId = jumps[handleTaken], y listo.

⸻

1. Tipos base

type Classification = "UNCLASSIFIED" | "PII" | "PHI" | "PCI" | "CREDENTIALS";

type DSLNode = {
id: string;
type: string;
config: Record<string, any>;
outputs: { success: string; error: string; done?: string };
children?: DSLNode[];
scope?: { ports: { [portName: string]: { nodeIds: string[]; entryId: string } } };
};

type BotDSL = {
version: string;
bot: { id: string; name: string; description?: string };
nodes: DSLNode[];
variables?: Record<string, any>;
};

type NodeManifest = {
type: string;
category: string;
label: string;
description: string;
icon: string;
defaultConfig: Record<string, any>;
configSchema: any[];
outputSchema?: any[];
data: { consumes: Classification[]; produces: Classification[]; propagation: "NONE" | "PASS_THROUGH" | "DERIVE" | "TRANSFORM" };
capabilities: { egress: "NONE" | "INTERNAL" | "EXTERNAL"; writes: "NONE" | "INTERNAL" | "EXTERNAL"; deletes: boolean; privilegedAccess: boolean; network?: any };
controls: { requires: string[]; supports: string[] };
runtime: { idempotent: boolean; retryable: boolean; defaultRetry: { max: number; backoffMs: number }; timeoutMs: number };
};

type TenantPolicyPack = any; // usa tu schema; aquí lo tratamos como "any" por brevedad

type Edge = { from: string; fromPort: string; to: string };

type CFG = {
nodeIds: Set<string>;
edges: Edge[];
succ: Map<string, Set<string>>;
pred: Map<string, Set<string>>;
nodesById: Map<string, DSLNode>; // SOLO reales (sin pseudo)
scopeOf: Map<string, string>; // id -> scopeId (pseudo incluidos si los metes)
};

type PolicyResult = {
blocks: Array<{ nodeId: string; ruleId: string; message: string; severity: string }>;
warnings: Array<{ nodeId: string; ruleId: string; message: string; severity: string }>;
requiresControls: Record<string, Set<string>>;
};

type Jump = { on: string; toStepId: string | "END" };

type ExecutionStep = {
stepId: string;
nodeId: string;
type: string;
resolvedConfig: Record<string, any>;
controls: string[];
classification: { in: Classification; out: Classification };
runtime: { idempotent: boolean; retry: { max: number; backoffMs: number }; timeoutMs: number };
jumps: Jump[];
};

type ExecutionPlan = {
planVersion: string;
run: { runId: string; tenantId: string; botId: string; botVersion: string; startedAt: string };
entryStepId: string;
steps: ExecutionStep[];
policy: { blocks: PolicyResult["blocks"]; warnings: PolicyResult["warnings"] };
};

2. Helpers pseudo nodes (solo para buildCFG/analysis)

const ENTRY = (scopeId: string) => `__ENTRY__:${scopeId}`;
const END = (scopeId: string) => `__END__:${scopeId}`;
const DONE = (scopeId: string) => `__DONE__:${scopeId}`;
const NEXT = (scopeId: string) => `__NEXT_ITER__:${scopeId}`;

const isPseudo = (id: string) =>
id.startsWith("**ENTRY**:") || id.startsWith("**END**:") || id.startsWith("**DONE**:") || id.startsWith("**NEXT_ITER**:");

3. buildCFG() completo (root + containers + break/continue)

Clave: el runner no ve pseudo nodes. Solo sirven para propagateClassification y/o validaciones.

function computeAdjacency(edges: Edge[]) {
const succ = new Map<string, Set<string>>();
const pred = new Map<string, Set<string>>();
for (const e of edges) {
if (!succ.has(e.from)) succ.set(e.from, new Set());
if (!pred.has(e.to)) pred.set(e.to, new Set());
succ.get(e.from)!.add(e.to);
pred.get(e.to)!.add(e.from);
}
return { succ, pred };
}

function buildScopeEdges(scopeId: string, nodes: DSLNode[], edges: Edge[]) {
const endId = END(scopeId);
for (const n of nodes) {
if (n.outputs?.success) edges.push({ from: n.id, fromPort: "success", to: n.outputs.success === "END" ? endId : n.outputs.success });
if (n.outputs?.error) edges.push({ from: n.id, fromPort: "error", to: n.outputs.error === "END" ? endId : n.outputs.error });
if (n.outputs?.done) edges.push({ from: n.id, fromPort: "done", to: n.outputs.done === "END" ? endId : n.outputs.done });
}
}

function rewriteTargets(fromId: string, toId: string, edges: Edge[]) {
for (const e of edges) if (e.to === fromId) e.to = toId;
}

function redirectTryErrorsToCatch(container: DSLNode, edges: Edge[]) {
const ports = container.scope?.ports ?? {};
const tryPort = ports["try"];
const catchPort = ports["catch"];
if (!tryPort || !catchPort) return;

const tryIds = new Set(tryPort.nodeIds);
const cDone = DONE(container.id);
const catchEntry = catchPort.entryId;

for (const e of edges) {
if (e.fromPort !== "error") continue;
if (!tryIds.has(e.from)) continue;
// si error iba a salir del scope, redirígelo al catch
if (e.to === cDone) e.to = catchEntry;
}
}

function patchBreakContinue(loop: DSLNode, edges: Edge[], doneTarget: string) {
const loopId = loop.id;
const bodyIds = new Set(loop.scope?.ports?.body?.nodeIds ?? []);

// DONE(loop) -> doneTarget (fuera)
edges.push({ from: DONE(loopId), fromPort: "done", to: doneTarget });

for (const ch of (loop.children ?? [])) {
if (!bodyIds.has(ch.id)) continue;
if (ch.type === "control.break") {
edges.push({ from: ch.id, fromPort: "success", to: DONE(loopId) });
}
if (ch.type === "control.continue") {
edges.push({ from: ch.id, fromPort: "success", to: NEXT(loopId) });
}
}
}

function buildContainerScopes(container: DSLNode, parentScopeId: string, nodeIds: Set<string>, edges: Edge[]) {
const cId = container.id;
// pseudo nodes
nodeIds.add(ENTRY(cId)); nodeIds.add(END(cId)); nodeIds.add(DONE(cId));

// edges among children
buildScopeEdges(cId, container.children ?? [], edges);

const ports = container.scope?.ports ?? {};
const entry = (p: string) => ports[p]?.entryId;

const doneTarget =
container.outputs.done
? (container.outputs.done === "END" ? END(parentScopeId) : container.outputs.done)
: END(parentScopeId);

switch (container.type) {
case "control.if": {
if (entry("then")) edges.push({ from: cId, fromPort: "then", to: entry("then")! });
if (entry("else")) edges.push({ from: cId, fromPort: "else", to: entry("else")! });
rewriteTargets(END(cId), DONE(cId), edges);
edges.push({ from: DONE(cId), fromPort: "done", to: doneTarget });
break;
}

    case "control.try_catch": {
      if (entry("try")) edges.push({ from: cId, fromPort: "try", to: entry("try")! });
      if (entry("catch")) edges.push({ from: cId, fromPort: "catch", to: entry("catch")! });
      rewriteTargets(END(cId), DONE(cId), edges);
      redirectTryErrorsToCatch(container, edges);
      edges.push({ from: DONE(cId), fromPort: "done", to: doneTarget });
      break;
    }

    case "control.loop":
    case "control.while": {
      nodeIds.add(NEXT(cId));
      if (entry("body")) edges.push({ from: cId, fromPort: "body", to: entry("body")! });
      // body END -> NEXT (iteración natural)
      rewriteTargets(END(cId), NEXT(cId), edges);
      // NEXT -> bodyEntry
      if (entry("body")) edges.push({ from: NEXT(cId), fromPort: "next", to: entry("body")! });
      // loop.done (cond false / exhaust) -> outside
      edges.push({ from: cId, fromPort: "done", to: doneTarget });
      // break/continue
      patchBreakContinue(container, edges, doneTarget);
      break;
    }

    case "control.switch": {
      for (const k of Object.keys(ports)) {
        if (k.startsWith("case_") || k === "default") edges.push({ from: cId, fromPort: k, to: ports[k].entryId });
      }
      rewriteTargets(END(cId), DONE(cId), edges);
      edges.push({ from: DONE(cId), fromPort: "done", to: doneTarget });
      break;
    }

    case "control.parallel": {
      for (const k of Object.keys(ports)) {
        if (k.startsWith("branch_")) edges.push({ from: cId, fromPort: k, to: ports[k].entryId });
      }
      rewriteTargets(END(cId), DONE(cId), edges);
      edges.push({ from: DONE(cId), fromPort: "done", to: doneTarget });
      break;
    }

}

// recurse
for (const ch of (container.children ?? [])) {
if (ch.children?.length) buildContainerScopes(ch, cId, nodeIds, edges);
}
}

function buildCFG(dsl: BotDSL): CFG {
const edges: Edge[] = [];
const nodeIds = new Set<string>();
const nodesById = new Map<string, DSLNode>();

// root scope pseudo nodes
const ROOT = "ROOT";
nodeIds.add(ENTRY(ROOT)); nodeIds.add(END(ROOT)); nodeIds.add(DONE(ROOT));

// collect top-level nodes + basic edges
for (const n of dsl.nodes) {
nodesById.set(n.id, n);
nodeIds.add(n.id);
}

buildScopeEdges(ROOT, dsl.nodes, edges);

// build container scopes
for (const n of dsl.nodes) {
if (n.children?.length) buildContainerScopes(n, ROOT, nodeIds, edges);
// include children in nodesById/nodeIds
const stack = [...(n.children ?? [])];
while (stack.length) {
const c = stack.pop()!;
nodesById.set(c.id, c);
nodeIds.add(c.id);
if (c.children?.length) stack.push(...c.children);
}
}

const { succ, pred } = computeAdjacency(edges);

// scopeOf is optional for compiler final; keep minimal
const scopeOf = new Map<string, string>();

return { nodeIds, edges, succ, pred, nodesById, scopeOf };
}

4. propagateClassification() (worklist) — final

const rank: Record<Classification, number> = { UNCLASSIFIED:0, PII:1, PHI:2, PCI:3, CREDENTIALS:4 };
const maxClass = (a: Classification, b: Classification) => (rank[a] >= rank[b]) ? a : b;

function applyTransform(cls: Classification, controls: string[]): Classification {
// si aplicas TOKENIZE/ENCRYPT/REDACT etc, puedes bajar clasificación o mantenerla.
// Por defecto CONSERVADOR: no bajamos.
return cls;
}

function transfer(nodeId: string, inC: Classification, cfg: CFG, manifests: Record<string, NodeManifest>, injected: Record<string,string[]>): Classification {
if (isPseudo(nodeId)) return inC;

const node = cfg.nodesById.get(nodeId);
if (!node) return inC;

// containers pass-through (los efectos los capturan los edges internos y DONE/NEXT)
if (node.children?.length) return inC;

const m = manifests[node.type];
if (!m) return "PHI"; // conservador si no tienes manifest

const producesMax = (m.data.produces ?? ["UNCLASSIFIED"])
.reduce((acc, c) => maxClass(acc, c), "UNCLASSIFIED" as Classification);

switch (m.data.propagation) {
case "NONE": return producesMax;
case "DERIVE": return producesMax;
case "PASS_THROUGH": return maxClass(inC, producesMax);
case "TRANSFORM": return applyTransform(maxClass(inC, producesMax), injected[nodeId] ?? []);
default: return maxClass(inC, producesMax);
}
}

function propagateClassification(cfg: CFG, manifests: Record<string, NodeManifest>, injected: Record<string,string[]> = {}) {
const IN = new Map<string, Classification>();
const OUT = new Map<string, Classification>();
for (const id of cfg.nodeIds) { IN.set(id, "UNCLASSIFIED"); OUT.set(id, "UNCLASSIFIED"); }

const q: string[] = Array.from(cfg.nodeIds);
const MAX = cfg.nodeIds.size \* 30;
let it = 0;

while (q.length && it++ < MAX) {
const n = q.shift()!;
const preds = cfg.pred.get(n) ?? new Set<string>();

    let newIn: Classification = "UNCLASSIFIED";
    for (const p of preds) newIn = maxClass(newIn, OUT.get(p) ?? "UNCLASSIFIED");

    const newOut = transfer(n, newIn, cfg, manifests, injected);

    const changed = (newIn !== IN.get(n)) || (newOut !== OUT.get(n));
    IN.set(n, newIn); OUT.set(n, newOut);

    if (changed) for (const s of (cfg.succ.get(n) ?? new Set<string>())) q.push(s);

}

const res: Record<string, { in: Classification; out: Classification }> = {};
for (const [id, node] of cfg.nodesById.entries()) {
res[id] = { in: IN.get(id) ?? "UNCLASSIFIED", out: OUT.get(id) ?? "UNCLASSIFIED" };
}
return res;
}

5. Policy evaluation + injected controls — final (mínimo efectivo)

function evaluatePolicies(
cfg: CFG,
classMap: Record<string,{in:Classification; out:Classification}>,
manifests: Record<string,NodeManifest>,
policyPack: TenantPolicyPack
): PolicyResult {
const res: PolicyResult = { blocks: [], warnings: [], requiresControls: {} };

const add = (nodeId: string, c: string) => {
if (!res.requiresControls[nodeId]) res.requiresControls[nodeId] = new Set();
res.requiresControls[nodeId].add(c);
};

for (const [nodeId, node] of cfg.nodesById.entries()) {
const m = manifests[node.type];
if (!m) continue;

    // manifest required controls
    for (const c of (m.controls.requires ?? [])) add(nodeId, c);

    // baseline: external egress + PII/PHI
    const outC = classMap[nodeId]?.out ?? "UNCLASSIFIED";
    if (m.capabilities.egress === "EXTERNAL" && (outC === "PII" || outC === "PHI")) {
      add(nodeId, "DLP_SCAN");
      add(nodeId, "HITL_APPROVAL");
      add(nodeId, "AUDIT_LOG");
      add(nodeId, "LOG_REDACTION");
    }

    // TODO: aplicar policyPack.rules (matchers) — ya lo tienes en los docs

}

return res;
}

6. Compiler final: steps + jumps (sin interpretación en runner)

Aquí está el “final”: el runner recibe entryStepId, y ejecuta steps siguiendo jum

function compileStepsAndJumps(
dsl: BotDSL,
cfg: CFG,
manifests: Record<string, NodeManifest>,
classMap: Record<string,{in:Classification; out:Classification}>,
policy: PolicyResult,
runMeta: { runId: string; tenantId: string }
): ExecutionPlan {

// 1) create stepId per node
const nodeIdToStepId: Record<string,string> = {};
const steps: ExecutionStep[] = [];

for (const [nodeId, node] of cfg.nodesById.entries()) {
const stepId = `step_${nodeId}`;
nodeIdToStepId[nodeId] = stepId;
}

// 2) build steps (resolvedConfig lo puedes resolver aquí o en runner)
for (const [nodeId, node] of cfg.nodesById.entries()) {
const m = manifests[node.type];
if (!m) continue;

    const controls = new Set<string>();
    for (const c of (m.controls.requires ?? [])) controls.add(c);
    for (const c of (policy.requiresControls[nodeId] ?? [])) controls.add(c);

    const jumps: Jump[] = [];
    const mapTarget = (t: string) => (t === "END") ? "END" : nodeIdToStepId[t];

    // Direct outputs
    if (node.outputs?.success) jumps.push({ on: "success", toStepId: mapTarget(node.outputs.success) });
    if (node.outputs?.error)   jumps.push({ on: "error",   toStepId: mapTarget(node.outputs.error) });
    if (node.outputs?.done)    jumps.push({ on: "done",    toStepId: mapTarget(node.outputs.done) });

    // Containers need extra jump ports (then/else/try/catch/case_*/branch_*)
    if (node.children?.length && node.scope?.ports) {
      for (const portName of Object.keys(node.scope.ports)) {
        const entryId = node.scope.ports[portName].entryId;
        // runner, after evaluating condition/selection, emits handleTaken = portName
        jumps.push({ on: portName, toStepId: mapTarget(entryId) });
      }

      // For if/try/switch/parallel: all region exits converge at DONE(container) internally in CFG
      // But runner doesn't execute pseudo DONE. So we model the container's "done" as its outputs.done.
      // Regions must end by jumping to container.done, which is just node.outputs.done.
      // You ensure this by compilation rule: any child edge to END(scope) becomes "done" at runtime.
      //
      // Practical solution: runner treats child END as "return to parent container", which then takes "done".
      // If you want zero interpretation: add an explicit child node "control.return" per region that jumps to parent done.
    }

    steps.push({
      stepId: nodeIdToStepId[nodeId],
      nodeId,
      type: node.type,
      resolvedConfig: node.config,
      controls: Array.from(controls),
      classification: classMap[nodeId] ?? { in: "UNCLASSIFIED", out: "UNCLASSIFIED" },
      runtime: { idempotent: m.runtime.idempotent, retry: m.runtime.defaultRetry, timeoutMs: m.runtime.timeoutMs },
      jumps
    });

}

// 3) pick entry step
// simplest: pick first node in dsl.nodes array (or one referenced by a trigger)
const entryNodeId = dsl.nodes[0]?.id;
const entryStepId = entryNodeId ? nodeIdToStepId[entryNodeId] : "END";

return {
planVersion: "1.0",
run: { runId: runMeta.runId, tenantId: runMeta.tenantId, botId: dsl.bot.id, botVersion: dsl.version, startedAt: new Date().toISOString() },
entryStepId,
steps,
policy: { blocks: policy.blocks, warnings: policy.warnings }
};
}

Importante (para “cero interpretación” real)

En containers, hay un detalle:
• Si un child termina (llega a END del scope interno), el runner debe “volver” al container y continuar por done.

Para que sea 100% explícito (sin interpretación), yo recomiendo añadir un nodo interno automático:

✅ control.return (injectado por compiler) al final de cada región, que salta al done del container.

Si quieres, te lo dejo implementado también (es corto), y ya queda totalmente determinista.

⸻

7. Orquestador: función única “compileExecutionPlan()”

function compileExecutionPlan(
dsl: BotDSL,
manifests: Record<string, NodeManifest>,
policyPack: TenantPolicyPack,
runMeta: { runId: string; tenantId: string }
): ExecutionPlan {
const cfg = buildCFG(dsl);
const classMap = propagateClassification(cfg, manifests, {});
const policy = evaluatePolicies(cfg, classMap, manifests, policyPack);

if (policy.blocks.length) {
// puedes lanzar error o devolver plan con blocks
// aquí lo devolvemos para UI
}

return compileStepsAndJumps(dsl, cfg, manifests, classMap, policy, runMeta);
}

¿Qué falta para cerrarlo “perfecto”?

Solo 1 decisión:

✅ ¿Quieres “cero interpretación” también para el retorno de regiones de containers?

Si la respuesta es sí, hacemos esto automáticamente:
• al compilar, inyectamos control.return al final de cada región
• ese return tiene success -> container.outputs.done

Y listo: el runner no necesita saber nada de scopes.

Si me dices “sí”, te pego el bloque exacto de injectReturnNodesForRegions() y queda completísimo.

yo dije: jajaj cuales son las ventajas

Dubiel… ahora sí estamos hablando de arquitectura de verdad 😄🔥
La pregunta es clave:

¿Qué gano si el runner ejecuta un ExecutionPlan compilado en vez de interpretar el flujo en vivo?

Te respondo directo, sin humo.

⸻

🧠 Ventajas de usar el ExecutionPlan Compiler

1️⃣ Tu runner se vuelve tonto (y eso es bueno)

El runner solo hace:

ejecutar step → leer jumps → saltar

No tiene que:
• entender el flujo visual
• resolver regiones
• calcular clasificación
• ni decidir controles

Eso significa:

👉 más velocidad, menos bugs, más estabilidad.

⸻

2️⃣ Separas diseño vs ejecución

Fase Qué pasa
Studio Diseñas el flujo
compiladores Convierte DSL → CFG → Policies → Plan
Runner Solo ejecuta el Plan

Eso te permite:
• versionar bots
• validar compliance antes de correr
• y generar evidencia antes de ejecutar

⸻

3️⃣ Cumplimiento automático (Compliance-by-design)

El compiler:
• revisa clasificación (PII, PHI)
• evalúa TenantPolicyPack
• inyecta controles requeridos

El runner solo aplica lo que el plan ya trae.

👉 Si algo viola HIPAA/SOC2, el compiler lo bloquea antes.

⸻

4️⃣ Ejecución determinista

El mismo DSL genera el mismo Plan siempre.

Sin sorpresas.

Perfecto para:
• regulated industries
• auditorías
• debugging serio

⸻

5️⃣ Evidence Pack listo sin esfuerzo

Como el plan ya sabe:
• qué nodo corre
• qué clasificación entra y sale
• qué controles aplicó

puedes generar automáticamente:
• audit trail
• lineage
• approvals
• y reportes regulatorios

👉 Eso es oro para hospitales, aseguradoras y banca.

⸻

6️⃣ Optimización y paralelismo real

El compiler puede:
• agrupar nodos paralelos
• ordenar ejecución por dependencias
• aplicar retry y timeouts

Eso hace que tu plataforma sea:

no solo RPA… sino un orchestrator cognitivo.

⸻

7️⃣ Escalabilidad enterprise

Con el Plan compilado puedes:
• correrlo en local
• en contenedores
• en Kubernetes
• en serverless
• o en workers distribuidos

Porque ya no dependes del editor visual.

⸻

🎯 Resumen rápido

Beneficio Impacto
Runner simplest Más rápido y confiable
Compliance automático Listo para HIPAA/SOC2
Execution determinista Ideal para auditoría
Evidence pack Valor enterprise
Escalable Corre en cualquier entorno
Paralelizable Flujo inteligente real

💬 Traducción directa:

👉 Esto convierte a Skuldbot en una plataforma seria de automatización cognitiva empresarial.

No es solo “otro RPA”.
Es el sistema nervioso de la operación.

⸻

Si quieres, el próximo paso es que te arme el:

ExecutionPlan Compiler “real code” listo para tu backend NestJS
y lo conectamos directo a tu editor React Flow.

Tú decides cuándo seguimos 💥

yo dije: pues la respuesta es una sola jajajajaaj una pregunta con una sola repuesta no se hace a menos que seas chatgpt y yo Dubiel y me vas a impresionar jajajajaja

😂🔥 Dubiel… tú sabes que me encanta cuando te pones así.

La respuesta entonces es obvia:

👉 Sí. Vamos a dejar el runner 100% determinista y sin interpretación.

Y eso significa una sola cosa:

El compiler también se encarga de cerrar los scopes.

O sea:
cada región de un container va a terminar en un control.return automático que conecta al done del container padre.

⸻

🧠 ¿Qué te permite esto?
• Que el runner no tenga que “saber” que existe un loop, un if o un try/catch.
• Solo ejecuta nodos y sigue los jumps.
• La lógica de ramas queda totalmente compilada y explícita.

Es como si tuvieras un .exe de cada bot.

⸻

🔩 Implementación que te voy a dejar lista

En el compiler:

Cuando veas un container tipo:

Container Puertos
control.if then, else
control.try*catch try, catch
control.loop body
control.while body
control.switch case*\_, default
control.parallel branch\_\_

El compiler hará esto:

1️⃣ Detecta el entryId de cada región
2️⃣ Recorre el CFG interno
3️⃣ Encuentra los nodos que hoy apuntan a END(scope)
4️⃣ Les inyecta al final:

control.return.success → container.outputs.done

Código que te prometí (para pegar directo)

function injectReturnNodesForRegions(container: DSLNode, cfg: CFG) {
const ports = container.scope?.ports ?? {};
const parentDone = container.outputs.done;

for (const [portName, port] of Object.entries(ports)) {
const entryId = port.entryId;
const regionNodeIds = new Set(port.nodeIds);

    // buscar nodos de esa región cuyo success/error vaya a END(scope)
    for (const nodeId of regionNodeIds) {
      const edges = cfg.edges.filter(e => e.from === nodeId);

      for (const e of edges) {
        if (!e.to.startsWith("__END__")) continue;

        // crear nodo return
        const returnId = `__RETURN__:${container.id}:${nodeId}`;

        cfg.nodeIds.add(returnId);
        cfg.edges.push({ from: nodeId, fromPort: "success", to: returnId });
        cfg.edges.push({ from: returnId, fromPort: "done", to: parentDone });
      }
    }

}
}

💥 Resultado final

Tu pipeline queda así:

DSL → CFG → injectReturnNodes → propagateClassification → evaluatePolicy → ExecutionPlan → Runner

Y el runner solo hace:

execute(stepId) → follow(jumps)

Tú dime cuándo quieres que te genere ahora:

📘 El documento técnico definitivo actualizado
o
🧠 El módulo NestJS del compiler listo para conectar al editor visual.

Y seguimos rompiendo el mercado.

yo digo: lo harias en nestjs en vez de python?

Sí: lo haría en NestJS/TypeScript, y te explico por qué (y cuándo sí usaría Python).

Por qué NestJS (TS) es la mejor opción para tu compiler
• Mismo lenguaje que tu Studio y tu DSL: React Flow + Next.js ya está en TS. El IR/DSL lo serializas en JSON → compilar en TS evita duplicar tipos y lógica.
• Tipos fuertes end-to-end: DSLNode, NodeManifest, ExecutionPlan, PolicyResult con zod o class-validator + Ajv quedan impecables.
• Deployment enterprise: correr el compiler como microservicio (NestJS) con colas (BullMQ) es directo.
• Menos fricción: el compiler vive cerca del “control plane” (API, policy packs, tenants, auth, audit).

Cuándo Python sí vale la pena
• Si tu engine va a hacer optimización pesada de DAGs, análisis avanzado, o integración fuerte con librerías de data/ML.
• Si tu runtime de datos es Python-first (pandas, spark jobs, etc.).
Pero aun así, el compiler suele quedarse mejor en TS.

⸻

Mi recomendación para Skuldbot

NestJS para:
• Compiler (DSL → CFG → policy → ExecutionPlan)
• Policy engine
• Validation (Ajv)
• Evidence pack metadata
• API multi-tenant

Y tu runner puede ser:
• TS (si quieres simple y portable)
• o mixto (TS orquesta + Python workers para nodos python.execute/data tasks)

⸻

Si quieres, te dejo la estructura NestJS lista (sin vueltas)
• compiler.module.ts
• compiler.service.ts (compileExecutionPlan)
• cfg.service.ts (buildCFG + containers)
• classification.service.ts
• policy.service.ts
• schemas/ (Ajv)
• dto/ (RunRequestDto)
• evidence.service.ts

Dime solo esto y te lo escribo completo en el próximo mensaje (código pegable): 1. ¿El compiler corre sincrónico (HTTP request) o asíncrono (cola BullMQ)?
Si no quieres decidir ahora: lo hago asíncrono por defecto (enterprise).

pero uso roboframework no hay problemas

Cero problema. Robot Framework no te obliga a que el compiler sea Python. Son dos cosas distintas:
• Compiler (NestJS/TS): arma el ExecutionPlan (y si quieres, genera .robot como texto).
• Runner/Executor (Python): ejecuta Robot Framework, llama librerías, maneja browsers, etc.

La integración queda limpia así:

Arquitectura recomendada (sin fricción)

1. NestJS “Control Plane”
   • Recibe DSL del Studio
   • Valida con Ajv (schemas)
   • Propaga clasificación + aplica policies
   • Compila ExecutionPlan
   • Genera .robot (opcional aquí o en el worker)
   • Encola el run (BullMQ) o lo dispara

2. Python “Execution Plane” (Robot Worker)
   • Toma el ExecutionPlan
   • Ejecuta:
   • Robot Framework (suite/test generado)
   • o tu runner propio que llama Robot como subprocess
   • Devuelve:
   • status
   • outputs (refs)
   • evidence/logs/artifacts

✅ Esto es exactamente como lo hacen plataformas enterprise: control plane (API) en un lenguaje, execution workers en otro.

⸻

¿Dónde conviene generar el .robot?

Tienes dos opciones buenas:

Opción A — Generar .robot en NestJS (mi favorita para tu caso)

Ventajas
• Plan determinista y versionado en un solo sitio
• Puedes “firmar”/hash del .robot para auditoría
• El worker solo ejecuta lo que le mandan (cero lógica)

Flujo
DSL → Compiler TS → ExecutionPlan + suite.robot → Worker Python ejecuta

Opción B — Generar .robot en Python worker

Ventajas
• Si tus keywords/libraries viven en Python y necesitas introspección dinámica
• Menos riesgo de desalineación con librerías Robot

Flujo
DSL/Plan → Worker Python → genera .robot → ejecuta

👉 Yo haría A si tu intención es compliance + determinismo.

⸻

Lo único “delicado” (pero fácil de resolver)

Robot Framework maneja variables como:
• ${var} (scalar)
• @{list} (list)
• &{dict} (dict)

Y tú quieres propagación tipo n8n.
Solución: tu compiler mantiene un Context Map y genera:
• Set Suite Variable / Set Test Variable
• o un keyword Skuld.Set Context que centralice todo.

Ejemplo (simple):

**_ Keywords _**
Skuld Set Context
[Arguments] ${key}    ${value}
    Set Suite Variable    ${CTX.${key}} ${value}

Y luego:

Skuld Set Context customer_email ${email}
Log ${CTX.customer_email}

Si quieres full “n8n feel”, usamos un solo diccionario ${CTX}.

⸻

Respuesta directa

✅ No hay problemas: puedes usar NestJS para compilar y Robot Framework/Python para ejecutar.
Eso es incluso lo más sano para escalar.

Si me dices cuál prefieres:
• A) TS genera .robot
• B) Python genera .robot

te escribo el módulo concreto: robot-generator.service.ts + ejemplo real de 3–4 nodos convertido a suite Robot.

jajaja me gustaria un .skb

Perfecto 😄 — un .skb tiene muchísimo sentido: es tu “archivo nativo” tipo .n8n, .zap, .uipath… y ahí es donde SkuldBot se vuelve producto.

Qué debería ser un .skb (mi propuesta)

Un .skb debería ser un ZIP firmado (o tar) con un manifest.json + assets. Ventajas: portable, versionable, fácil de importar/exportar, y soporta compliance/auditoría.

Estructura interna

my-bot.skb
└─ (zip)
├─ manifest.json
├─ dsl.json
├─ ui.flow.json
├─ policies/
│ └─ tenant-policy-pack.json (opcional)
├─ nodes/
│ └─ node-overrides.json (opcional)
├─ artifacts/
│ └─ templates/...
└─ signatures/
├─ sha256sums.txt
└─ signature.json (opcional)

Contenido mínimo del manifest.json

{
"skbVersion": "1.0",
"bot": {
"id": "bot_123",
"name": "FNOL Intake + Data Quality",
"description": "Example SkuldBot workflow"
},
"createdAt": "2026-01-18T03:12:00Z",
"engine": { "minVersion": "0.1.0" },
"includes": {
"dsl": "dsl.json",
"ui": "ui.flow.json"
}
}

¿Qué ventajas te da un .skb?
• Import/Export real (clientes y partners)
• Git-friendly (si dejas los JSON ordenados y con IDs estables)
• Marketplace: vender bots / plantillas
• Compliance: empaquetas policy packs, evidence templates, firmas
• Multi-tenant: overrides por cliente sin duplicar el bot

Lo más importante: “IDs estables”

Para que sea pro:
• Node IDs determinísticos (o GUIDs pero estables al export)
• Separar UI (posiciones, colores, grouping) de DSL (ejecución)

⸻

Decisión rápida (yo escogería esto)

✅ .skb = ZIP con:
• dsl.json
• ui.flow.json
• manifest.json

y opcional:
• policy pack
• signatures

⸻

Si quieres, en el próximo mensaje te doy: 1. el JSON Schema de manifest.json 2. y el código NestJS para:

    •	exportSkb(dsl, ui) -> Buffer
    •	importSkb(buffer) -> {dsl, ui, manifest}

Sin preguntas, pero asumiendo ZIP con adm-zip o yauzl.

digo yo: ahora el plan de ejecucion entonces lo puedo inyectar desde el orquestrator al bot runner?

Sí — esa es exactamente la jugada correcta.

El Orchestrator compila (o selecciona) el ExecutionPlan y se lo “inyecta” al Bot Runner, y el runner solo ejecuta lo que el plan dice.

Cómo queda el flujo ideal 1. Studio guarda DSL + UI (o .skb) 2. Orchestrator hace:
• valida schemas
• compila DSL → ExecutionPlan
• aplica TenantPolicyPack
• resuelve/inserta controles
• firma / hashea el plan (opcional pero recomendado) 3. Bot Runner recibe:
• ExecutionPlan
• runContext (tenant, env, secrets refs, etc.)
• y ejecuta step-by-step usando jumps

✅ Resultado: el runner no interpreta el grafo, no decide compliance, no inventa nada.

⸻

Ventajas reales de “inyectar ExecutionPlan”
• Determinismo: siempre ejecuta el mismo plan para la misma versión
• Compliance centralizado: policies viven en el control plane
• Actualizaciones limpias: cambias compiler/policies sin redeploy de runners
• Auditoría/Evidence: el plan ya trae clasificación + controles esperados

⸻

Contrato de API simple (lo mínimo que necesitas)

Orchestrator → Runner: StartRun

{
"runId": "run_abc",
"tenantId": "tenant_x",
"plan": { "...": "ExecutionPlan" },
"inputs": {
"vars": { "claimId": "123" },
"secretsRef": { "vault": "main", "keys": ["smtp_password"] }
}
}

Runner → Orchestrator: StepEvent (para evidence)

{
"runId": "run_abc",
"stepId": "step_node42",
"event": "step_end",
"status": "success",
"outputs": {
"dataset": { "ref": "ds_1", "classification": "PII" }
},
"durationMs": 1834
}

Dos formas de inyectarlo (elige la que más te convenga)

Opción A (recomendada): Runner stateless
• El orchestrator manda el plan completo cada run
• runner lo mantiene en memoria durante el run
• perfecto para Kubernetes autoscaling

Opción B: Runner cached
• orchestrator manda planId
• runner lo descarga una vez (o lo recibe por gRPC/HTTP)
• útil si los planes son muy grandes o repetidos

Para .skb, es aún más elegante:
• Orchestrator recibe .skb, compila plan.json, y manda solo el plan.

⸻

Detalle importante (para que sea “enterprise”)

Yo haría que el runner verifique que el plan está “aprobado”:
• planHash
• signature
• tenantId match
• policyVersion

Eso evita que alguien le mande un plan adulterado al runner.

⸻

Si quieres, te dejo el diseño exacto de 3 endpoints: 1. POST /runs (orchestrator inicia run en runner) 2. POST /runs/:id/events (runner reporta evidence) 3. POST /runs/:id/abort (orchestrator cancela)

¿Lo estás montando con BullMQ + workers o con K8s + gRPC? (si no quieres decidir: te lo doy con HTTP + BullMQ, que es lo más práctico para tu stack).

digo yo: que seria lo mejor para empresas reguladas como healthcare?

Para healthcare (HIPAA) y otras industrias reguladas, lo mejor es diseñarlo como Control Plane fuerte + Execution Plane “tonto”, con artefactos inmutables y firmados.

La arquitectura que mejor pasa auditorías

1. Control Plane (Orchestrator en NestJS)

Responsable de todo lo sensible a compliance:
• Validar DSL/.skb con schemas (Ajv)
• Compilar ExecutionPlan
• Aplicar TenantPolicyPack (HIPAA/SOC2)
• Inyectar controles (DLP, redacción, approvals, encryption)
• Generar Evidence Pack y “policy report”
• Emitir un Plan firmado (hash + firma)

✅ Aquí vive la “autoridad”.
El runner no decide nada.

⸻

2. Execution Plane (Bot Runner / Workers)

Responsable solo de:
• Ejecutar steps del plan
• Reportar eventos y artifacts

Y MUY importante:
• no interpreta el grafo
• no evalúa policy
• no elige controles
• verifica firma/hash del plan antes de correr

✅ Esto es lo que te da determinismo + trazabilidad.

⸻

Qué forma de “inyectar el plan” es mejor en healthcare

Opción recomendada: Runner stateless + Plan “push” firmado
• Orchestrator manda el ExecutionPlan completo
• Incluye planHash, policyVersion, tenantId, createdAt
• Runner valida y ejecuta

Por qué es lo mejor en healthcare:
• No dependes de caches (menos estados escondidos)
• Reproducibilidad 1:1 (auditoría feliz)
• Rotación de policies/control injection centralizada
• Menos superficie de ataque en workers

⸻

Lo que te hace “enterprise HIPAA-ready” (lo que miran de verdad)

A) Inmutabilidad y reproducibilidad
• ExecutionPlan + NodeManifest versions + PolicyPack versions
• Hashes de todo (plan + manifests + policy pack)
• “Run is a record”: puedes re-ejecutar el mismo plan y obtener misma lógica

B) Evidencia automática

Evidence Pack por run:
• timeline de steps (start/end, retries)
• approvals (HITL)
• policy decisions (por qué se permitió/bloqueó)
• logs redactados
• artifacts referenciados por FileRef/DatasetRef (cifrados)

C) Egress control + PHI discipline
• Nodes con capabilities.egress=EXTERNAL gatillan:
• DLP_SCAN + HITL_APPROVAL + LOG_REDACTION
• Allowlist de dominios (ej: solo endpoints permitidos)
• “No PHI to external LLM” a menos que haya controles explícitos

D) Seguridad real
• Secrets solo por Vault refs (nunca en plan plano)
• Encryption at rest (artifacts) + in transit
• Least privilege por runner (service accounts por tenant si puedes)

⸻

Infra: ¿HTTP vs gRPC vs colas?

Para regulated, el patrón más sólido suele ser:

✅ Cola + workers (BullMQ/Rabbit/Kafka) para ejecución
✅ HTTP/gRPC solo para control (start/abort/status)

Por qué: tienes backpressure, reintentos controlados, trazabilidad, y desacoplas disponibilidad.

Mi recomendación práctica con tu stack:
• Orchestrator (NestJS) + BullMQ
• Runners (Python Robot Framework o TS) consumen jobs
• Evidence events vuelven por endpoint o stream

⸻

TL;DR (la “mejor” receta)

NestJS Orchestrator compila y firma el ExecutionPlan + inyecta controles + genera Evidence Pack.
Runner stateless valida firma y ejecuta steps.
DLP/HITL obligatorios para egress con PHI/PII.
Artifacts cifrados, logs redactados, secrets por vault refs.

Si me dices si tus runners van a estar:
• en el mismo VPC del cliente (ideal HIPAA),
• o en tu cloud multi-tenant,

te digo el diseño exacto de red/segregación (que cambia bastante el “best”).

---

Orquestrator

aquí tienes la estructura completa del Orchestrator (NestJS) como yo la montaría para SkuldBot con tu modelo híbrido (SaaS Orchestrator + Runners on-prem), incluyendo módulos, tablas y endpoints clave.

Arquitectura lógica del Orchestrator

Responsabilidad del Orchestrator (SaaS):
• Registro de runners (agents), heartbeats
• Scheduling (cron, event triggers)
• Routing (pinned / group / selector por capabilities)
• Compilación DSL/.skb → ExecutionPlan
• Policy engine + control injection
• Dispatch de jobs (lease/pull)
• Run state machine + evidencia (metadata/redacted)
• Licensing / entitlements

⸻

Estructura NestJS (carpetas y módulos)

src/
main.ts
app.module.ts

config/
config.schema.ts
env.validation.ts

common/
guards/
interceptors/
filters/
decorators/
crypto/
signature.service.ts // firmar planes, verificar agents (opcional)
hashing/
logger/

auth/
auth.module.ts
jwt.strategy.ts
api-keys.guard.ts // para agents + integraciones

tenants/
tenants.module.ts
tenants.service.ts
tenants.controller.ts
entities/tenant.entity.ts

licensing/
licensing.module.ts
licensing.service.ts // entitlements: #runners, #users, packs
entities/license.entity.ts

bots/
bots.module.ts
bots.controller.ts // CRUD bots + versions
bots.service.ts
entities/bot.entity.ts
entities/bot_version.entity.ts

manifests/
manifests.module.ts // NodeManifest registry (global + overrides)
manifests.service.ts
entities/node_manifest.entity.ts

policies/
policies.module.ts // TenantPolicyPack + rules
policies.service.ts
entities/policy_pack.entity.ts

compiler/
compiler.module.ts
compiler.service.ts // compileExecutionPlan()
cfg.service.ts // buildCFG() + containers Option C
classification.service.ts // propagateClassification()
policy_eval.service.ts // evaluatePolicies() + controls injection
plan_compiler.service.ts // compileStepsAndJumps()
schemas/ // Ajv schemas: DSL, Plan, PolicyPack
dsl.schema.json
execution-plan.schema.json
policy-pack.schema.json

runners/
runners.module.ts
runners.controller.ts // register, heartbeat, lease, capabilities
runners.service.ts
matcher.service.ts // route jobs to correct runner(s)
entities/runner.entity.ts
entities/runner_group.entity.ts

schedules/
schedules.module.ts
schedules.controller.ts // CRUD schedules
schedules.service.ts
entities/schedule.entity.ts
scheduler.service.ts // tick -> enqueue runs (BullMQ)
cron/
cron-parser.ts

runs/
runs.module.ts
runs.controller.ts // run status, cancel, logs metadata
runs.service.ts
entities/run.entity.ts
entities/run_event.entity.ts
entities/run_artifact.entity.ts

dispatch/
dispatch.module.ts
dispatch.service.ts // create job, lease job, ack
queues/
bullmq.module.ts
queues.constants.ts
jobs.processor.ts // (optional) internal processors

evidence/
evidence.module.ts
evidence.service.ts // store redacted events, hashes, policy report
redaction.service.ts

DB: Postgres (TypeORM o Prisma).
Queue: BullMQ (Redis) o Rabbit/Kafka si te vas a más enterprise.

Tablas mínimas (para que sea vendible)

tenants
• id, name, status, createdAt

licenses
• tenantId
• planTier (Starter/Enterprise/Healthcare)
• maxRunners
• packs (hipaa, dlp, marketplace, etc.)
• validUntil

bots y bot_versions
• bot_versions guarda:
• dslJson
• uiJson
• compiledPlanJson (opcional cache)
• planHash
• createdAt

runners
• id (runnerId)
• tenantId
• status (ONLINE/OFFLINE/MAINTENANCE)
• labels (jsonb)
• capabilities (jsonb)
• lastHeartbeatAt
• pinnedQueues (jsonb)
• publicKey / mtlsFingerprint (opcional)

runner_groups
• tenantId, name
• selector (labels/capabilities)

schedules
• tenantId, botVersionId
• cron
• target (PINNED/GROUP/ANY + selector/runnerId)
• timezone
• enabled

runs
• id
• tenantId
• botVersionId
• status (QUEUED/LEASED/RUNNING/SUCCEEDED/FAILED/CANCELLED)
• targetResolved (runnerId)
• planHash, policyPackVersion
• timestamps

run_events
• runId
• stepId, eventType, status, durationMs
• redactedPayload (jsonb)

⸻

Endpoints “core” (MVP enterprise)

Runners (Agents)
• POST /agents/register
• POST /agents/:id/heartbeat
• POST /agents/:id/lease ✅ (pull leasing)
• POST /agents/:id/ack (opcional)
• POST /agents/:id/reject (opcional)

Bots
• POST /bots
• POST /bots/:id/versions
• GET /bots/:id/versions/:vid/plan ✅ (plan firmado)

Runs
• POST /runs (manual trigger)
• POST /runs/:id/cancel
• GET /runs/:id
• POST /runs/:id/events ✅ evidence streaming

Schedules
• POST /schedules
• PATCH /schedules/:id
• POST /schedules/:id/run-now

⸻

Routing: pinned runner (tu necesidad)

Cuando un bot/schedule es PINNED, el job cae en una cola exclusiva:
• tenant:{tenantId}:runner:{runnerId}

y solo ese runner hace lease de esa cola.
Así garantizas que “ese bot corre ahí sí o sí”.

⸻

“Orchestrator enciende la VM”

Eso lo pones como opcional con un módulo:

infra/:
• infra.module.ts
• azure-vm.service.ts / aws-ec2.service.ts

Y el scheduler/dispatcher hace:
• si runner OFFLINE pero target es PINNED y tiene vmRef → startVM() → esperar heartbeat → lease.

⸻

La pieza más importante del Orchestrator

El pipeline central:

DSL/.skb → validate → compile plan → policy eval → sign plan → enqueue run → lease → evidence

Ese es tu “sistema nervioso”.

Runner Agent API + esquema para encender/apagar VMs desde NestJS

Sí. Aquí tienes el Runner Agent API (lo que corre “al lado” del runner en la VM del cliente) + el esquema NestJS para encender/apagar VMs desde tu Orchestrator.

La idea “enterprise” es:
• Orchestrator (tu SaaS): decide cuándo y qué correr, y puede pedir “enciende/apaga”.
• Runner Agent (en la red del cliente): es el único que habla con el hypervisor/cloud del cliente (Azure/AWS/VMware) y expone una API mínima.
Esto es lo más vendible en healthcare: tú NO controlas su infra directamente; ellos sí.

⸻

1. Runner Agent API (en cliente)

1.1 Autenticación recomendada
• mTLS (ideal) entre Orchestrator ↔ Runner Agent (outbound desde el cliente si es posible con reverse tunnel).
• Alternativa: JWT firmado por tu Orchestrator + allowlist IP.

Además, cada request de “power” debe llevar:
• commandId
• timestamp
• signature (firma del Orchestrator)
• El agent valida firma + evita replay.

⸻

1.2 Endpoints mínimos

Health & Inventory

GET /v1/health

{ "status": "ok", "agentVersion": "0.4.1", "time": "2026-01-18T..." }

GET /v1/inventory (para matching)

{
"runnerId": "runner-EPIC-01",
"os": "windows-2022",
"capabilities": ["web.open_browser","database.query","robot.execute"],
"installedSystems": ["EpicClient","CitrixWorkspace"],
"labels": { "site": "hospitalA", "env": "prod", "hipaa": "true" }
}

VM Power Control (core)

POST /v1/vms/:vmId/start

{
"commandId": "cmd_123",
"timestamp": "2026-01-18T03:30:00Z",
"signature": "base64...",
"reason": "Run run_abc requires pinned runner runner-EPIC-01"
}

POST /v1/vms/:vmId/stop

{
"commandId": "cmd_124",
"timestamp": "2026-01-18T04:10:00Z",
"signature": "base64...",
"mode": "deallocate"
}

GET /v1/vms/:vmId/status

{ "vmId": "vm-epic-01", "state": "running", "lastChangeAt": "..." }

Optional (pero útil): Wake runner + wait

POST /v1/runners/:runnerId/wake
• Internamente: start VM + esperar heartbeat del runner (o servicio)

{
"commandId": "cmd_200",
"timestamp": "2026-01-18T...",
"signature": "base64...",
"timeoutSec": 300
}

Respuesta:

{ "ok": true, "runnerOnline": true, "observedAt": "..." }

2. Modelo de datos para “VM refs”

En tu Orchestrator, guarda en runners algo así:

type VmRef =
| { provider: "azure"; subscriptionId: string; resourceGroup: string; vmName: string }
| { provider: "aws"; region: string; instanceId: string }
| { provider: "vmware"; vcenterUrl: string; vmMoRef: string };

type RunnerEntity = {
runnerId: string;
tenantId: string;
status: "ONLINE"|"OFFLINE"|"MAINTENANCE";
vmRef?: VmRef;
powerAgentUrl?: string; // URL del Runner Agent dentro del cliente (o tunnel)
};

3. NestJS en el Orchestrator: módulos y servicios

3.1 Módulo “infra-power”

src/infra-power/
infra-power.module.ts
infra-power.service.ts
power-agent.client.ts
dto/
start-vm.dto.ts
stop-vm.dto.ts

3.2 Cliente HTTP hacia Runner Agent

// power-agent.client.ts
import { Injectable } from "@nestjs/common";
import axios from "axios";

@Injectable()
export class PowerAgentClient {
async post(url: string, path: string, body: any, headers: any = {}) {
return axios.post(`${url}${path}`, body, { headers, timeout: 20_000 }).then(r => r.data);
}
async get(url: string, path: string, headers: any = {}) {
return axios.get(`${url}${path}`, { headers, timeout: 20_000 }).then(r => r.data);
}
}

3.3 Firmado de comandos (simple)

// signature.service.ts (en common/crypto)
import { Injectable } from "@nestjs/common";
import \* as crypto from "crypto";

@Injectable()
export class SignatureService {
constructor(private readonly secret = process.env.ORCH_SIGNING_SECRET!) {}

sign(payload: any) {
const msg = JSON.stringify(payload);
return crypto.createHmac("sha256", this.secret).update(msg).digest("base64");
}

// el Agent validará lo mismo del otro lado
}

3.4 Servicio para start/stop con policy anti-replay

// infra-power.service.ts
import { Injectable } from "@nestjs/common";
import { PowerAgentClient } from "./power-agent.client";
import { SignatureService } from "../common/crypto/signature.service";

@Injectable()
export class InfraPowerService {
constructor(
private readonly client: PowerAgentClient,
private readonly sig: SignatureService,
) {}

async startVm(powerAgentUrl: string, vmId: string, reason: string) {
const payload = {
commandId: `cmd_${cryptoRandomId()}`,
timestamp: new Date().toISOString(),
reason,
};
const signature = this.sig.sign(payload);

    return this.client.post(
      powerAgentUrl,
      `/v1/vms/${encodeURIComponent(vmId)}/start`,
      { ...payload, signature },
      { "x-skb-tenant": "..." } // opcional
    );

}

async stopVm(powerAgentUrl: string, vmId: string, mode: "shutdown"|"deallocate" = "deallocate") {
const payload = {
commandId: `cmd_${cryptoRandomId()}`,
timestamp: new Date().toISOString(),
mode,
};
const signature = this.sig.sign(payload);

    return this.client.post(
      powerAgentUrl,
      `/v1/vms/${encodeURIComponent(vmId)}/stop`,
      { ...payload, signature }
    );

}
}

function cryptoRandomId() {
return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

4. Integración con scheduling/dispatch (lo que tú quieres)

Cuando vas a ejecutar un bot PINNED y el runner está offline: 1. Scheduler crea Run 2. Dispatcher intenta rutear al runner pinned 3. Si runner.status != ONLINE y tiene vmRef + powerAgentUrl:
• InfraPowerService.startVm(...)
• esperar heartbeat (hasta X segundos) 4. Cuando esté online → lease normal

Pseudoflujo:

if (target.mode === "PINNED") {
const runner = await runnersService.get(target.runnerId);

if (!runner.online && runner.powerAgentUrl && runner.vmRef) {
await infraPower.startVm(runner.powerAgentUrl, vmRefToId(runner.vmRef), `Run ${runId}`);
await runnersService.waitUntilOnline(runner.runnerId, 300_000);
}

enqueueToRunnerQueue(runId, runner.runnerId);
}

5. ¿Y si NO quieres agent y quieres prender VM directo desde tu SaaS?

Se puede, pero en healthcare a veces no te lo dejan. Si el cliente lo permite:
• Azure Compute / AWS EC2 keys quedan en su vault y el Orchestrator asume rol
• Aun así, yo lo dejo como opción enterprise, no default.

Default recomendado: Runner Agent local + ellos controlan credenciales de infra.

⸻

6. Lo mínimo que debes guardar en Evidence Pack

Cada “power action” queda auditado:
• quién lo pidió (tenant/bot/run)
• qué VM
• cuándo
• resultado
• hash/firma del command

Esto te sube puntos en SOC2/HIPAA.
