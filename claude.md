Plataforma RPA – Requerimientos Técnicos (CLAUDE.md)

VISIÓN GENERAL
Esta plataforma define un sistema RPA enterprise basado en Robot Framework y rpaframework, con un Studio visual,
un Orchestrator y un BotRunner desacoplados.

ARQUITECTURA
Studio (Tauri + React + React Flow)
→ DSL JSON
→ Compiler
→ Bot Package (Robot Framework)
→ Orchestrator (NestJS)
→ BotRunner (Python)
→ Logs / Resultados

DECISIÓN TECNOLÓGICA CLAVE
- Studio NO debe usar Next.js.
  Motivo: Next.js está orientado a SSR/web y no aporta valor dentro de Tauri.
  El Studio debe usar:
    - React + Vite
    - React Flow
    - TailwindCSS
    - shadcn/ui

- Orchestrator:
    - NestJS (backend)
    - Next.js (frontend admin / dashboards)

GESTIÓN DE ERRORES (OBLIGATORIA)
Todos los nodos RPA deben tener salidas:
- success (línea verde)
- error (línea naranja)

El error es un objeto estructurado con:
code, message, nodeId, retryable, details

SISTEMA DE VARIABLES POR NODO

El sistema de variables permite que cada nodo tenga sus propias variables locales de estado,
además de variables globales para el último error.

1. Variables Por Nodo (Locales)
   Cada nodo en Robot Framework tiene un diccionario de estado:
   &{NODE_<node_id>}  con keys: status, output, error

   En el Studio se accede usando el label del nodo:
   - ${Node Label.output}  → Salida principal del nodo
   - ${Node Label.error}   → Mensaje de error si el nodo falló
   - ${Node Label.status}  → Estado: pending, success, error

   El Compiler transforma automáticamente:
   ${Read Excel.output} → ${NODE_node_123}[output]

2. Variables Globales de Error
   Disponibles cuando un nodo está conectado via línea naranja (error):
   - ${LAST_ERROR}       → Mensaje del último error
   - ${LAST_ERROR_NODE}  → ID del nodo que falló
   - ${LAST_ERROR_TYPE}  → Tipo del nodo (ej: excel.read_range)

3. Variables de Sistema
   - ${BOT_ID}      → ID del bot
   - ${BOT_NAME}    → Nombre del bot
   - ${BOT_STATUS}  → Estado: RUNNING, SUCCESS, FAILED

4. Variables de Salida por Tipo de Nodo
   Excel:
   - ${EXCEL_DATA}       → Datos leídos (lista de diccionarios)
   - ${EXCEL_ROW_COUNT}  → Cantidad de filas
   - ${CELL_VALUE}       → Valor de celda individual

   Files:
   - ${FILE_CONTENT}  → Contenido del archivo leído
   - ${FILE_EXISTS}   → Boolean de existencia

   API/HTTP:
   - ${HTTP_RESPONSE}  → Cuerpo de respuesta
   - ${HTTP_STATUS}    → Código de estado HTTP

   Web:
   - ${LAST_TEXT}       → Texto extraído de elemento
   - ${LAST_ATTRIBUTE}  → Atributo extraído
   - ${JS_RESULT}       → Resultado de JavaScript

5. Transformación de Sintaxis (Compiler)
   El filtro transform_vars en compiler.py convierte la sintaxis del Studio
   a la sintaxis de Robot Framework:

   Studio                          → Robot Framework
   ${Form Trigger.formData.name}   → ${formData}[name]
   ${Read Excel.output}            → ${NODE_node_id}[output]
   ${Read Excel.data}              → ${NODE_node_id}[data]
   ${LAST_ERROR}                   → ${LAST_ERROR}  (sin cambios)

   El Compiler mantiene un node_id_map (label → id) para la conversión.

6. Flujo de Datos Entre Nodos
   ```
   [Form Trigger] ──success──> [Read Excel] ──success──> [Log Data]
        │                           │                        │
        │ formData                  │ output, data           │ usa variables
        │ formData.name             │ status, error          │ de nodos anteriores
        │ formData.email            │ rowCount               │
        └───────────────────────────┴────────────────────────┘
                                    │
                                    ├──error──> [Handle Error]
                                                     │
                                                     │ LAST_ERROR
                                                     │ LAST_ERROR_NODE
                                                     │ LAST_ERROR_TYPE
                                                     │ Read Excel.error
   ```

7. Archivos Relacionados
   - engine/skuldbot/compiler/compiler.py
     - transform_variable_syntax() - Transforma sintaxis de variables
     - _node_id_map - Mapeo de labels a IDs

   - engine/skuldbot/compiler/templates/main_v2.robot.j2
     - Define variables globales y per-nodo
     - Implementa TRY/EXCEPT con almacenamiento de errores

   - studio/src/components/NodeConfigPanel.tsx
     - Muestra variables disponibles en panel INPUT
     - Agrupa por nodo predecesor
     - Click para copiar expresión

SISTEMA DE DEBUG (MOTOR REAL)

El Studio está conectado al motor real de Python/Robot Framework via Tauri IPC.
NO usa simulaciones - ejecuta código Robot Framework real.

1. Arquitectura de Ejecución
   ```
   Studio (React)
       │
       │ invoke("run_bot", { dsl: JSON.stringify(dsl) })
       ▼
   Tauri (Rust) ── main.rs: run_bot command
       │
       │ Python subprocess
       ▼
   Engine (Python)
       │
       ├── Compiler: DSL → Bot Package
       │
       └── Executor: Robot Framework
           │
           └── Output: logs, results
   ```

2. Flujo de Debug
   - Usuario presiona "Debug" (Play) en DebugPanel
   - debugStore.startDebug() genera DSL desde flowStore
   - Si no hay trigger, auto-agrega Manual Trigger
   - Llama invoke("run_bot") via Tauri IPC
   - El Engine compila DSL a directorio temporal
   - Robot Framework ejecuta main.robot
   - Logs se parsean y muestran en tiempo real
   - Estados de nodos se actualizan (pending → running → success/error)

3. Comandos Tauri (main.rs)
   - run_bot: Compila y ejecuta DSL
   - compile_bot: Solo compila DSL a Bot Package
   - get_excel_sheets: Lee hojas de archivo Excel

4. Estados de Debug
   - idle: Sin ejecución
   - running: Ejecutando bot
   - paused: Pausado (breakpoints - futuro)
   - stopped: Ejecución terminada

5. Breakpoints (Futuro)
   - Se pueden agregar via click en nodo
   - Se almacenan en debugStore.breakpoints
   - Pendiente: integración con executor para pausar

6. Archivos Relacionados
   - studio/src/store/debugStore.ts
     - Estado de debug, breakpoints, historial
     - startDebug() ejecuta el bot real

   - studio/src/components/DebugPanel.tsx
     - UI de controles de debug
     - Play, Pause, Stop, Step

   - studio/src-tauri/src/main.rs
     - Comando run_bot que llama al Engine

   - engine/skuldbot/executor/executor.py
     - Ejecuta Robot Framework
     - Parsea output.xml para resultados

INTEGRACIÓN CON PYTHON (ELECTRONEEK-STYLE)
Nodo Python Project Executor:
- Ejecuta proyectos Python existentes
- Se define project path + entrypoint + entorno
- Retorna JSON estructurado
- Se enruta por success/error

BOT PACKAGE
Incluye:
- main.robot
- resources/
- variables/
- python/ (proyectos embebidos)
- requirements.txt / pyproject.toml
- manifest.json

OBJETIVO
Construir una plataforma RPA moderna, abierta y extensible donde Robot Framework sea el motor invisible y
el valor esté en el Studio, la orquestación y la integración con IA y datos.

RECOMENDACIÓN FINAL DE ARQUITECTURA

Se recomienda adoptar una arquitectura desacoplada y moderna que evite complejidad innecesaria y maximice mantenibilidad y escalabilidad.

Arquitectura recomendada:

apps/
- studio-desktop/
  - Tauri
  - React + Vite
  - React Flow
  - TailwindCSS
  - shadcn/ui

- orchestrator-api/
  - NestJS
  - PostgreSQL
  - Storage de artifacts

- orchestrator-ui/
  - Next.js
  - Dashboards
  - Gestión de bots, runs y usuarios

- bot-runner/
  - Python
  - Robot Framework + rpaframework

packages/
- dsl/
- compiler/
- node-sdk/

Esta separación garantiza:
- Studio ligero y optimizado para desktop
- Backend robusto y escalable
- Frontend web moderno para operación
- Runner determinista y seguro
- Evolución independiente de cada componente

RUNNER – FRAMEWORKS DE EJECUCIÓN

El BotRunner se basa en una combinación de frameworks, donde cada uno cumple una función específica y complementaria.

Robot Framework:
- Actúa como el motor de ejecución.
- Gestiona el control de flujo, la ejecución determinista, el manejo base de errores y la generación de reportes estándar
  (output.xml, log.html, report.html).
- No es RPA por sí solo, sino un runtime genérico y robusto.

RPA Framework (rpaframework):
- Es un framework RPA construido sobre Robot Framework.
- Proporciona librerías listas para producción para:
  - Automatización web
  - Automatización desktop
  - Manejo de Excel, archivos y PDFs
  - Email, APIs y servicios cloud
- Es open source (Apache 2.0).
- Constituye la capa RPA especializada del Runner.

Arquitectura final del Runner:
- Python
- Robot Framework (motor)
- RPA Framework / rpaframework (librerías RPA)
- Librerías Python personalizadas (nodos propios)
- Runtime Manager (gestión de entornos, dependencias y sandbox)

Esta combinación permite alcanzar paridad funcional con plataformas RPA comerciales, manteniendo apertura, extensibilidad
y control total del stack.

ESTRUCTURA DEL PROYECTO

La plataforma se organiza en un monorepo con 4 componentes principales:

📦 skuldbot/
├── engine/              ✅ LISTO - Motor de ejecución compartido
│   - Python + Robot Framework + rpaframework
│   - DSL, Compiler, Executor
│   - Usado por Studio (debug) y Runner (production)
│
├── studio/             🔜 TODO - Editor visual desktop
│   - Tauri + React + Vite + React Flow
│   - Editor drag & drop de flujos
│   - Preview y debug local
│   - Upload a Orchestrator
│
├── orchestrator/       🔜 TODO - Backend y UI web
│   ├── api/           - NestJS + PostgreSQL
│   │   - REST API para gestión
│   │   - Compilación de DSL
│   │   - Storage de artifacts
│   └── ui/            - Next.js
│       - Dashboards
│       - Gestión de bots y usuarios
│
└── runner/            🔜 TODO - Agente de ejecución
    - Python standalone
    - Polling/webhook de Orchestrator
    - Ejecuta Bot Packages
    - Envía logs en tiempo real

COMPONENTES COMPARTIDOS

El Engine actúa como librería compartida:
- Usado por Studio para compilar y ejecutar localmente
- Usado por Orchestrator para compilar DSL a Bot Packages
- Usado por Runner para ejecutar bots en producción

Opcionalmente se pueden publicar:
- @skuldbot/dsl (npm) – Definiciones TypeScript del DSL
- skuldbot-engine (PyPI) – Engine como paquete instalable

EJEMPLO DE DSL JSON

```json
{
  "version": "1.0",
  "bot": {
    "id": "bot-001",
    "name": "Extraer Facturas",
    "description": "Descarga facturas del portal y las procesa"
  },
  "nodes": [
    {
      "id": "node-1",
      "type": "browser.open",
      "config": {
        "url": "https://portal.example.com",
        "browser": "chromium"
      },
      "outputs": {
        "success": "node-2",
        "error": "node-error"
      }
    },
    {
      "id": "node-2",
      "type": "browser.fill",
      "config": {
        "selector": "#username",
        "value": "${credentials.username}"
      },
      "outputs": {
        "success": "node-3",
        "error": "node-error"
      }
    },
    {
      "id": "node-error",
      "type": "notification.send",
      "config": {
        "channel": "email",
        "message": "Error en bot: ${error.message}"
      }
    }
  ],
  "variables": {
    "credentials": {
      "type": "credential",
      "vault": "orchestrator"
    }
  }
}
```

DIAGRAMA DE ARQUITECTURA

```
┌─────────────────┐
│  Studio Desktop │
│  (Tauri + React)│
└────────┬────────┘
         │ Crea/Edita
         ▼
    ┌─────────┐
    │ DSL JSON│
    └────┬────┘
         │ Upload
         ▼
┌──────────────────────┐      ┌─────────────────┐
│   Orchestrator API   │◄────►│ Orchestrator UI │
│      (NestJS)        │      │    (Next.js)    │
└──────────┬───────────┘      └─────────────────┘
           │
           │ Dispatch Job
           ▼
    ┌─────────────┐
    │  Bot Runner │
    │  (Python +  │
    │   Robot FW) │
    └─────────────┘
           │
           │ Logs/Results
           ▼
    ┌──────────────┐
    │  PostgreSQL  │
    └──────────────┘
```

FLUJO DE EJECUCIÓN

1. Usuario diseña bot en Studio → genera bot.json
2. Usuario sube bot.json a Orchestrator vía UI
3. Orchestrator compila DSL → Bot Package (.zip con .robot)
4. Orchestrator almacena Bot Package
5. Usuario programa ejecución (trigger manual, schedule, webhook)
6. Orchestrator envía job a BotRunner disponible
7. BotRunner descarga Bot Package
8. BotRunner ejecuta con Robot Framework
9. BotRunner envía logs en tiempo real
10. BotRunner reporta resultado final (success/error)

SEGURIDAD Y AUTENTICACIÓN

Orchestrator API:
- JWT tokens con refresh
- RBAC (roles: admin, operator, viewer)
- API Keys para Runners

BotRunner:
- Autenticación con API Key rotativa
- Ejecución en sandbox (Docker/VM opcional)
- Secrets manejados por Orchestrator (no en Bot Package)

Studio:
- Autenticación opcional con Orchestrator
- Modo offline (edición local sin Orchestrator)
- Encriptación de credenciales en DSL

Variables sensibles:
- Nunca en DSL plano
- Referencias a vault: ${vault.api_key}
- Orchestrator resuelve en runtime

ROADMAP DE IMPLEMENTACIÓN

Fase 1 - MVP (3-4 meses):
- [ ] Studio básico (nodos web, archivos, variables)
- [ ] Compiler DSL → Robot Framework
- [ ] Orchestrator API (bots, jobs, users)
- [ ] Orchestrator UI (dashboard básico)
- [ ] BotRunner con polling simple
- [ ] Gestión de errores básica

Fase 2 - Producción (2-3 meses):
- [ ] Studio: más nodos (email, Excel, PDF, APIs)
- [ ] Studio: debugger visual
- [ ] Orchestrator: scheduling avanzado
- [ ] Orchestrator: webhooks
- [ ] BotRunner: ejecución paralela
- [ ] Logs en tiempo real (WebSockets)
- [ ] RBAC completo

Fase 3 - Enterprise (3-4 meses):
- [ ] Python Project Executor
- [ ] Integración con IA (OpenAI, Claude)
- [ ] Métricas y analytics avanzados
- [ ] Marketplace de nodos custom
- [ ] High availability (multi-runner)
- [ ] Auditoria completa

Fase 4 - Escalabilidad (ongoing):
- [ ] Kubernetes deployment
- [ ] Multi-tenancy
- [ ] Runner en edge
- [ ] Versionado de bots
- [ ] A/B testing de flujos

VERSIONADO DEL DOCUMENTO

- Versión: 1.0
- Fecha: Diciembre 2025
- Autor: Equipo Khipus
- Última actualización: 16/12/2025

NOTAS TÉCNICAS ADICIONALES

Compiler:
- Input: DSL JSON
- Output: main.robot + resources/ + variables/ + manifest.json
- Validación de schema con JSON Schema
- Optimización de flujo (dead code elimination)

Bot Package (.zip):
```
bot-001.zip
├── manifest.json
├── main.robot
├── resources/
│   ├── keywords.robot
│   └── error_handler.robot
├── variables/
│   └── config.yaml
├── python/
│   └── custom_library.py
└── requirements.txt
```

Orchestrator Storage:
- Artifacts: S3-compatible (MinIO, AWS S3)
- Logs: Time-series DB (opcional: InfluxDB)
- Metadata: PostgreSQL

Runner Environment:
- Python 3.10+
- Chromium/Firefox drivers automáticos
- Java 11+ (para ciertos nodos)
- Espacio temporal para downloads/uploads

