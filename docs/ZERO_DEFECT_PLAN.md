# Plan Zero-Defect / Zero-Regression Enterprise-Grade

**Fecha**: 2026-04-10
**Autor**: Lico (AI Assistant)
**Referencia**: `docs/PLATFORM_AUDIT_2026.md`
**Meta**: Llevar SkuldBot a 0-defecto, 0-regresion, enterprise-grade certificable

---

## Principios del Plan

1. **Zero-Defect**: Todo codigo en produccion debe estar validado por tests automaticos
2. **Zero-Regression**: Ningun cambio puede romper funcionalidad existente sin ser detectado
3. **Enterprise-Grade**: Cumplir SOC2 Type II, HIPAA, GDPR como baseline
4. **Shift-Left**: Detectar defectos lo mas temprano posible en el pipeline
5. **Automatizar todo**: Si un humano lo revisa manualmente, eventualmente fallara

---

## Estructura del Plan

El plan se organiza en 6 fases secuenciales. Cada fase tiene un **Quality Gate**
que debe cumplirse antes de avanzar a la siguiente.

```
FASE 1: Foundation (Semanas 1-3)
   │ Quality Gate: CI verde, linting, formatting
   ▼
FASE 2: Testing Core (Semanas 4-8)
   │ Quality Gate: >80% cobertura en Engine y Studio stores
   ▼
FASE 3: Integration & E2E (Semanas 9-12)
   │ Quality Gate: Flujo E2E automatizado pasa
   ▼
FASE 4: Security & Compliance (Semanas 13-16)
   │ Quality Gate: SAST/DAST limpio, Evidence Pack funcional
   ▼
FASE 5: Observability & Resilience (Semanas 17-20)
   │ Quality Gate: Dashboards, alertas y DR probado
   ▼
FASE 6: Certification & Hardening (Semanas 21-24)
   │ Quality Gate: Pen test passed, load test passed, audit trail verificado
   ▼
PRODUCCION ENTERPRISE-GRADE
```

---

## FASE 1: Foundation (Semanas 1-3)

**Objetivo**: Establecer la base de calidad sobre la cual se construye todo lo demas.
Sin esta fase, testing y CI/CD no tienen sentido.

### 1.1 Monorepo Tooling

**Problema**: INF-001 - Sin herramienta unificada de monorepo
**Solucion**: Implementar Turborepo

```
Tareas:
- [ ] Instalar turborepo en raiz del proyecto
- [ ] Crear turbo.json con pipelines: build, test, lint, typecheck
- [ ] Crear pnpm-workspace.yaml que agrupe apps/* y libs/*
- [ ] Migrar cada app a pnpm (unificar package managers)
- [ ] Verificar que `turbo run build` compila todo correctamente
- [ ] Verificar que `turbo run test` ejecuta todos los tests
```

**Entregable**: `turbo run build && turbo run test` pasa en <5 minutos

### 1.2 Linting y Formatting Unificado

**Problema**: INF-004 - Inconsistencia de codigo
**Solucion**: ESLint + Prettier + Ruff (Python)

```
Tareas:
TypeScript (todos los apps/):
- [ ] Configurar ESLint compartido en raiz (eslint.config.js)
- [ ] Configurar Prettier compartido (.prettierrc)
- [ ] Agregar reglas: no-unused-vars, no-any, strict-null-checks
- [ ] Ejecutar formateo masivo (una sola vez, un commit grande)
- [ ] Agregar pre-commit hook con lint-staged + husky

Python (engine + runner):
- [ ] Configurar ruff en pyproject.toml (linting + formatting)
- [ ] Configurar mypy para type checking
- [ ] Ejecutar formateo masivo
- [ ] Agregar pre-commit hook
```

**Entregable**: `turbo run lint` pasa sin errores

### 1.3 CI/CD Pipeline Base

**Problema**: INF-002, INF-003 - Solo 2 workflows, sin validacion en PR
**Solucion**: GitHub Actions completo

```yaml
# .github/workflows/ci.yml - A crear
Tareas:
- [ ] Workflow "CI" en cada PR y push a main:
      - Lint (ESLint + Ruff)
      - Type check (tsc --noEmit + mypy)
      - Unit tests (todos los componentes)
      - Build (todos los componentes)
- [ ] Workflow "Integration Tests" en merge a main:
      - Levantar PostgreSQL + Redis en CI
      - Ejecutar integration tests
      - Ejecutar E2E tests
- [ ] Branch protection en main:
      - Require CI passing
      - Require 1 review
      - No force push
- [ ] Workflow "Security" semanal:
      - npm audit / pip audit
      - SAST scanning
- [ ] Caching de node_modules y pip en CI
```

**Entregable**: PRs no se pueden mergear sin CI verde

### 1.4 Docker Compose para Desarrollo

**Problema**: INF-005 - Onboarding lento
**Solucion**: docker-compose.dev.yml

```
Tareas:
- [ ] Crear docker-compose.dev.yml con:
      - PostgreSQL 16
      - Redis 7
      - Orchestrator API (hot reload)
      - Control Plane API (hot reload)
      - MinIO (S3 local)
- [ ] Crear .env.example con todas las variables necesarias
- [ ] Documentar en QUICKSTART.md
- [ ] Script: ./scripts/dev-setup.sh (one-command setup)
```

**Entregable**: Nuevo desarrollador operativo en <15 minutos

### Quality Gate Fase 1
```
[ ] turbo run build - pasa
[ ] turbo run lint - 0 errores
[ ] turbo run typecheck - 0 errores
[ ] CI pipeline ejecuta en cada PR
[ ] docker-compose up levanta todo el stack
[ ] Branch protection activa en main
```

---

## FASE 2: Testing Core (Semanas 4-8)

**Objetivo**: Llevar cobertura de tests a niveles enterprise.
Meta: >80% en logica critica, >60% general.

### 2.1 Engine - Unit Tests (P0)

**Problema**: ENG-001, ENG-002, ENG-003 + cobertura 60%
**Meta**: >85% cobertura

```
Tareas:
- [ ] Tests para TODOS los nodos del registry (288 tipos):
      - Cada nodo compila sin error
      - Cada nodo genera Robot Framework valido
      - Config mappings son correctos
- [ ] Tests de control flow:
      - [ ] control.if - condiciones, branching
      - [ ] control.loop - iteracion, break, continue
      - [ ] control.while - condicion de salida
      - [ ] control.try_catch - error handling
      - [ ] control.switch - multiple branches
      - [ ] control.parallel - ejecucion paralela
- [ ] Tests del Compiler:
      - [ ] Variable transformation (todas las sintaxis)
      - [ ] Nested containers (loop dentro de if, etc.)
      - [ ] Edge cases: nodos sin conexiones, ciclos, nodos huerfanos
      - [ ] Manifest generation con todos los campos
      - [ ] Template rendering completo
- [ ] Tests del Executor:
      - [ ] Output.xml parsing estructurado
      - [ ] Callbacks (on_start, on_step, on_log, on_complete, on_error)
      - [ ] Modo DEBUG vs PRODUCTION
      - [ ] Cancelacion de ejecucion
      - [ ] Timeout handling
- [ ] Tests del Evidence Pack:
      - [ ] Writer genera paquete valido
      - [ ] Encryption AES-256-GCM funciona
      - [ ] Firmas digitales verificables
      - [ ] Chain of custody completa
      - [ ] Integridad verificable (Merkle tree)
- [ ] Configurar pytest-cov con threshold 85%
- [ ] Agregar pytest al CI pipeline
```

**Entregable**: `pytest --cov=skuldbot --cov-fail-under=85` pasa

### 2.2 Studio - Store Tests

**Problema**: STU-001, STU-002
**Meta**: 100% cobertura en stores, >70% en componentes

```
Tareas:
- [ ] Configurar Vitest para Studio
- [ ] Tests para cada store (15 stores):
      flowStore:
      - [ ] addNode, removeNode, updateNode
      - [ ] addEdge, removeEdge
      - [ ] generateDSL (output correcto para todos los node types)
      - [ ] selection, multi-selection
      - [ ] copy/paste

      projectStore:
      - [ ] create, save, load project
      - [ ] add/remove bot
      - [ ] manifest serialization
      - [ ] auto-save timing

      debugStore:
      - [ ] startDebug, stopDebug
      - [ ] breakpoints set/remove
      - [ ] execution state transitions
      - [ ] node execution tracking
      - [ ] variable inspection

      validationStore:
      - [ ] compile errors detection
      - [ ] warnings vs errors
      - [ ] error clearing on fix

      aiPlannerV2Store:
      - [ ] plan generation flow
      - [ ] plan application to canvas
      - [ ] conversation state management

      vaultStore:
      - [ ] encrypt/decrypt
      - [ ] CRUD operations
      - [ ] key rotation

      (demas stores: connectionsStore, licenseStore, historyStore,
       navigationStore, tabsStore, toastStore, logsStore)

- [ ] Tests para utilidades criticas:
      - [ ] dsl.ts - DSL builder
      - [ ] flowSanitizer.ts - validacion de flujos
      - [ ] expressionSyntax.ts - parsing de expresiones
      - [ ] nodeCategories.ts - categorias
      - [ ] containerNodes.ts - logica de contenedores
      - [ ] dataMasking.ts - redaccion de datos
```

**Entregable**: `vitest run --coverage` >80% en stores

### 2.3 Studio - Component Tests

```
Tareas:
- [ ] Configurar React Testing Library
- [ ] Tests de componentes criticos:
      - [ ] CustomNode - render correcto por tipo
      - [ ] NodeConfigPanel - configuracion dinamica
      - [ ] Sidebar - drag & drop de nodos
      - [ ] Toolbar - acciones (compile, run, save)
      - [ ] DebugPanel - controles de debug
      - [ ] VaultManager - CRUD de secretos
      - [ ] FormBuilder - construccion de formularios
- [ ] Snapshot tests para componentes UI:
      - [ ] Todos los componentes en ui/
      - [ ] CustomNode en cada estado (pending, running, success, error)
      - [ ] NodeConfigPanel para cada categoria de nodo
```

**Entregable**: `vitest run` pasa con >70% en componentes

### 2.4 Orchestrator API - Tests

**Problema**: ORC-001
**Meta**: >80% cobertura

```
Tareas:
- [ ] Tests unitarios por modulo:
      - [ ] bots.service - CRUD, validacion
      - [ ] runs.service - lifecycle, status transitions
      - [ ] runners.service - registro, health check
      - [ ] audit.service - logging, retention
      - [ ] evidence.service - capture, storage, retrieval
      - [ ] auth.service - JWT, refresh, RBAC
      - [ ] billing.service - metering, invoicing
      - [ ] credentials.service - encryption, rotation
      - [ ] dispatch.service - job assignment, retry
      - [ ] schedules.service - cron parsing, execution
- [ ] Tests de controllers (request/response):
      - [ ] Validacion de DTOs
      - [ ] HTTP status codes correctos
      - [ ] Error responses estandarizados
      - [ ] Authorization checks
- [ ] Tests de guards y middleware:
      - [ ] JwtAuthGuard
      - [ ] RolesGuard
      - [ ] Rate limiting
- [ ] Configurar Jest con coverage threshold 80%
```

**Entregable**: `jest --coverage --coverageThreshold='{"global":{"lines":80}}'` pasa

### 2.5 Control Plane API - Tests

**Problema**: CPA-001
**Meta**: >75% cobertura

```
Tareas:
- [ ] Tests por modulo (similar a Orchestrator)
- [ ] Focus en:
      - [ ] tenants.service - isolation, provisioning
      - [ ] licenses.service - validation, enforcement
      - [ ] billing.service - Stripe integration mocks
      - [ ] sso.service - SAML/OIDC flows
      - [ ] marketplace.service - listing, rental
```

### 2.6 Runner Service - Tests

**Problema**: RUN-001
**Meta**: >75% cobertura

```
Tareas:
- [ ] Tests del agent:
      - [ ] Polling loop
      - [ ] Job pickup y acknowledgment
      - [ ] Execution lifecycle
      - [ ] Error reporting
- [ ] Tests del executor:
      - [ ] Bot package unpacking
      - [ ] Robot Framework invocation
      - [ ] Output parsing
      - [ ] Evidence pack generation
- [ ] Tests del API client:
      - [ ] Authentication
      - [ ] Retry logic
      - [ ] Connection handling
- [ ] Tests de seguridad:
      - [ ] Secret resolution
      - [ ] Sandbox isolation
```

### Quality Gate Fase 2
```
[ ] Engine: pytest --cov-fail-under=85 pasa
[ ] Studio stores: >80% cobertura
[ ] Studio componentes: >70% cobertura
[ ] Orchestrator API: >80% cobertura
[ ] Control Plane API: >75% cobertura
[ ] Runner: >75% cobertura
[ ] CI ejecuta TODOS los tests en cada PR
[ ] 0 tests flaky (cada test pasa 10/10 veces)
```

---

## FASE 3: Integration & E2E (Semanas 9-12)

**Objetivo**: Validar que los componentes funcionan juntos correctamente.
Esta es la fase mas critica para zero-regression.

### 3.1 Integration Tests - Engine

**Problema**: ENG-009
**Solucion**: Tests que ejecutan Robot Framework real

```
Tareas:
- [ ] Configurar entorno de integration tests:
      - Robot Framework instalado
      - rpaframework instalado (headless mode)
      - Chromium headless para nodos web
- [ ] Tests de compilacion + ejecucion real:
      - [ ] Bot simple: trigger -> log -> end
      - [ ] Bot con variables: set -> use -> log
      - [ ] Bot con control flow: if/else, loop, try/catch
      - [ ] Bot con Excel: read -> process -> write
      - [ ] Bot con HTTP: request -> parse -> log
      - [ ] Bot con database: connect -> query -> close
      - [ ] Bot con error handling: fail -> catch -> recover
- [ ] Tests de Evidence Pack real:
      - [ ] Ejecutar bot y verificar que .evp se genera
      - [ ] Verificar integridad criptografica del pack
      - [ ] Verificar que PII se redacta en screenshots
- [ ] Marcar como `@pytest.mark.integration`
- [ ] Ejecutar en CI con servicios reales (PostgreSQL, Redis)
```

### 3.2 Integration Tests - Orchestrator <-> Runner

**Problema**: ORC-002, flujo E2E no validado

```
Tareas:
- [ ] Tests de comunicacion:
      - [ ] Runner se registra en Orchestrator
      - [ ] Runner envia heartbeat
      - [ ] Orchestrator despacha job
      - [ ] Runner recibe y ejecuta job
      - [ ] Runner reporta progreso (logs)
      - [ ] Runner reporta resultado final
      - [ ] Orchestrator almacena resultado
      - [ ] Evidence Pack se almacena
- [ ] Tests de resiliencia:
      - [ ] Runner se desconecta y reconecta
      - [ ] Job timeout y re-asignacion
      - [ ] Orchestrator se reinicia, Runner reconecta
      - [ ] Ejecucion cancelada mid-flight
```

### 3.3 Integration Tests - CP <-> Orchestrator

**Problema**: CPA-002

```
Tareas:
- [ ] Tests de contrato:
      - [ ] Orchestrator register/heartbeat/deregister
      - [ ] Usage ingest con idempotencia
      - [ ] License validation y enforcement
      - [ ] Quota check en runtime
- [ ] Contract tests (Pact o similar):
      - [ ] Definir contratos para cada endpoint
      - [ ] Verificar consumer y provider por separado
      - [ ] Ejecutar en CI
```

### 3.4 E2E Tests - Flujo Completo

**El test mas importante de toda la plataforma**

```
Tareas:
- [ ] Configurar Playwright para E2E
- [ ] Test E2E #1: Bot Simple
      1. Abrir Studio
      2. Crear bot con trigger manual + log
      3. Compilar
      4. Ejecutar en debug
      5. Verificar log output
      6. Verificar nodo se marca verde

- [ ] Test E2E #2: Bot con Error
      1. Crear bot con nodo que falla
      2. Ejecutar
      3. Verificar nodo se marca rojo
      4. Verificar error en panel de logs
      5. Verificar linea naranja se activa

- [ ] Test E2E #3: Flujo Completo (Studio -> Orchestrator -> Runner)
      1. Crear bot en Studio
      2. Subir a Orchestrator
      3. Programar ejecucion
      4. Runner ejecuta
      5. Verificar resultado en Orchestrator UI
      6. Verificar Evidence Pack generado

- [ ] Test E2E #4: AI Planner
      1. Describir flujo en lenguaje natural
      2. Generar plan
      3. Aplicar al canvas
      4. Verificar nodos y conexiones correctas
      5. Compilar y ejecutar
```

### 3.5 Performance Baseline

**Problema**: INF-009

```
Tareas:
- [ ] Instalar k6 o Artillery para load testing
- [ ] Baseline tests:
      - [ ] Orchestrator API: 100 req/s GET /bots
      - [ ] Orchestrator API: 50 req/s POST /runs
      - [ ] WebSocket: 100 conexiones simultaneas
      - [ ] Compilacion: <5s para bot de 50 nodos
      - [ ] Compilacion: <30s para bot de 500 nodos
- [ ] Guardar baselines en CI para detectar regresiones
- [ ] Studio performance:
      - [ ] Canvas render <16ms (60fps) con 100 nodos
      - [ ] Canvas render <33ms (30fps) con 500 nodos
      - [ ] Memory <500MB con 1000 nodos
```

### Quality Gate Fase 3
```
[ ] Integration tests Engine: 7+ escenarios pasan
[ ] Integration tests Orchestrator-Runner: comunicacion bidireccional funciona
[ ] Integration tests CP-Orchestrator: contratos verificados
[ ] E2E test flujo completo: Studio->Orchestrator->Runner->Result pasa
[ ] Performance baselines establecidos y no regresan
[ ] Todos los tests ejecutan en CI en <15 minutos
```

---

## FASE 4: Security & Compliance (Semanas 13-16)

**Objetivo**: Cumplir requisitos de seguridad y compliance para industrias reguladas.

### 4.1 SAST/DAST/SCA

**Problema**: INF-010

```
Tareas:
- [ ] SAST (Static Application Security Testing):
      - [ ] Configurar Semgrep o CodeQL en CI
      - [ ] Reglas custom para SkuldBot:
            - No PII en logs
            - No secrets hardcoded
            - SQL injection prevention
            - XSS prevention
            - Command injection prevention
      - [ ] Ejecutar en cada PR, bloquear si HIGH/CRITICAL

- [ ] SCA (Software Composition Analysis):
      - [ ] npm audit en CI (0 high/critical)
      - [ ] pip audit en CI (0 high/critical)
      - [ ] Cargo audit en CI (0 high/critical)
      - [ ] Configurar Dependabot o Renovate para updates automaticos
      - [ ] License compliance check (no GPL en dependencias)

- [ ] DAST (Dynamic Application Security Testing):
      - [ ] Configurar OWASP ZAP contra Orchestrator API
      - [ ] Ejecutar semanalmente
      - [ ] 0 high/critical findings
```

### 4.2 Evidence Pack - Produccion

**Problema**: ENG-002

```
Tareas:
- [ ] Completar integracion automatica:
      - [ ] Writer se invoca automaticamente en cada ejecucion
      - [ ] Screenshots se capturan y redactan
      - [ ] Decision log se genera para nodos AI
      - [ ] Data lineage se registra
      - [ ] Firma digital se aplica al final
- [ ] Verificacion de integridad:
      - [ ] Endpoint GET /evidence/:id/verify
      - [ ] Recalcula hashes y compara
      - [ ] Verifica firma digital
      - [ ] Verifica chain of custody
- [ ] Storage:
      - [ ] S3 con WORM policy
      - [ ] Retention configurable por tenant
      - [ ] Legal hold support
- [ ] Tests:
      - [ ] Generar Evidence Pack, corromper un archivo, verificar que falla
      - [ ] Verificar que PII no aparece en texto plano
      - [ ] Verificar retention y deletion
```

### 4.3 Control Flow Nodes

**Problema**: ENG-001 - El gap funcional mas critico

```
Tareas:
- [ ] Implementar control.if:
      - Evaluacion de condiciones (==, !=, >, <, contains, regex)
      - Branching a success/else
      - Nested ifs
      - Tests: 10+ escenarios

- [ ] Implementar control.loop:
      - Iteracion sobre listas/arrays
      - Index variable
      - Break/continue
      - Nested loops
      - Tests: 10+ escenarios

- [ ] Implementar control.while:
      - Condicion de salida
      - Max iterations (safety)
      - Tests: 5+ escenarios

- [ ] Implementar control.try_catch:
      - Try/catch/finally
      - Error propagation
      - Nested try/catch
      - Tests: 8+ escenarios

- [ ] Implementar control.switch:
      - Multiple cases
      - Default case
      - Fall-through vs break
      - Tests: 5+ escenarios

- [ ] Implementar control.parallel:
      - Ejecucion concurrente
      - Wait all vs wait any
      - Error handling en paralelo
      - Tests: 5+ escenarios
```

### 4.4 Security Hardening

```
Tareas:
Orchestrator API:
- [ ] Rate limiting por endpoint (express-rate-limit)
- [ ] Helmet.js para HTTP headers
- [ ] CORS configuracion estricta
- [ ] Request validation global (class-validator pipes)
- [ ] Input sanitization (DOMPurify para HTML, parameterized queries)
- [ ] JWT refresh token rotation
- [ ] API key rotation automatica
- [ ] Audit log de TODOS los endpoints sensibles

Control Plane API:
- [ ] Tenant isolation verificada (tests de cross-tenant access)
- [ ] SSO/SAML/OIDC hardening
- [ ] MFA enforcement para admins

Runner:
- [ ] Sandbox de ejecucion (Docker container per-run)
- [ ] Network isolation (no acceso a internal services)
- [ ] Resource limits (CPU, memory, disk, time)
- [ ] Secret injection via env vars (nunca en archivos)

Studio:
- [ ] CSP headers en Tauri webview
- [ ] Verificacion de integridad de Engine binary
- [ ] Auto-update con verificacion de firma
```

### 4.5 OpenAPI/Swagger

**Problema**: ORC-007

```
Tareas:
- [ ] Configurar @nestjs/swagger en Orchestrator API
- [ ] Decorar TODOS los endpoints con @ApiOperation, @ApiResponse
- [ ] Decorar TODOS los DTOs con @ApiProperty
- [ ] Generar openapi.json automaticamente en CI
- [ ] Publicar Swagger UI en /api/docs
- [ ] Hacer lo mismo para Control Plane API
- [ ] Contract testing contra OpenAPI spec
```

### Quality Gate Fase 4
```
[ ] SAST: 0 high/critical findings
[ ] SCA: 0 high/critical vulnerabilities
[ ] DAST: 0 high/critical findings
[ ] Evidence Pack se genera automaticamente en cada ejecucion
[ ] Evidence Pack integridad verificable end-to-end
[ ] Control flow nodes: if, loop, while, try_catch, switch funcionales
[ ] Rate limiting activo en todos los APIs
[ ] OpenAPI spec generada y publicada
[ ] Tenant isolation verificada con tests
```

---

## FASE 5: Observability & Resilience (Semanas 17-20)

**Objetivo**: Visibilidad total del sistema en produccion y capacidad de recuperacion.

### 5.1 Health Checks

**Problema**: ORC-003, RUN-002

```
Tareas:
- [ ] Orchestrator API:
      - GET /health/ready (database, redis, storage)
      - GET /health/live (process alive)
      - Kubernetes probes configurados
- [ ] Control Plane API:
      - GET /health/ready
      - GET /health/live
- [ ] Runner:
      - Health reporting al Orchestrator cada 30s
      - Resource utilization (CPU, memory, disk)
      - Ejecuciones activas count
      - Graceful shutdown con drain period
```

### 5.2 Structured Logging

```
Tareas:
- [ ] Estandarizar formato de logs (JSON structured):
      {
        "timestamp": "ISO8601",
        "level": "info|warn|error",
        "service": "orchestrator|control-plane|runner",
        "traceId": "uuid",
        "spanId": "uuid",
        "message": "...",
        "context": { ... }
      }
- [ ] Implementar correlation IDs:
      - Generar traceId en el primer servicio
      - Propagar en headers (X-Trace-Id)
      - Incluir en todos los logs
- [ ] PII redaction automatica en logs:
      - Interceptor que detecta y redacta PII/PHI
      - Patterns: email, SSN, credit card, phone
      - Configurable por tenant
- [ ] Log aggregation:
      - [ ] Configurar Pino (NestJS) o Winston
      - [ ] Output a stdout (container-friendly)
      - [ ] Opciones: ELK, Loki, CloudWatch, Datadog
```

### 5.3 Metricas y Dashboards

**Problema**: INF-006

```
Tareas:
- [ ] Instrumentar con Prometheus client:
      Orchestrator:
      - http_requests_total (method, path, status)
      - http_request_duration_seconds
      - bot_compilations_total (status)
      - bot_executions_total (status)
      - websocket_connections_active
      - queue_jobs_active
      - queue_jobs_completed
      - queue_jobs_failed
      - database_query_duration_seconds

      Runner:
      - bot_execution_duration_seconds
      - bot_execution_status (success, failed, cancelled)
      - evidence_pack_generation_duration
      - resource_utilization (cpu, memory, disk)

      Control Plane:
      - tenant_count
      - active_licenses
      - api_calls_by_tenant
      - billing_events_total

- [ ] Dashboards Grafana:
      - [ ] Platform Overview (todos los servicios)
      - [ ] Orchestrator Deep Dive
      - [ ] Runner Fleet Status
      - [ ] Execution Analytics
      - [ ] Error Budget (SLO tracking)
```

### 5.4 Alerting

**Problema**: INF-007

```
Tareas:
- [ ] Definir SLOs:
      - API availability: 99.9%
      - API latency p99: <500ms
      - Bot execution success rate: >95%
      - Evidence Pack generation: 100%

- [ ] Configurar alertas:
      CRITICAL (PagerDuty/OpsGenie):
      - API down >2 minutos
      - Database connection failed
      - 0 runners available
      - Evidence Pack generation failure
      - Security: unauthorized access pattern

      WARNING (Slack/Email):
      - API latency p99 >1s
      - Queue depth >100
      - Runner utilization >80%
      - Disk space <20%
      - Error rate >5%
      - Certificate expiry <30 days
```

### 5.5 Disaster Recovery

**Problema**: INF-008

```
Tareas:
- [ ] Definir RTO/RPO:
      - Database: RPO <1 hora, RTO <4 horas
      - Evidence Packs: RPO 0 (immutable), RTO <8 horas
      - Configuration: RPO <24 horas, RTO <2 horas

- [ ] Implementar:
      - [ ] Database backups automaticos (pg_dump cron)
      - [ ] Point-in-time recovery configurado
      - [ ] Cross-region replication para Evidence Packs
      - [ ] Configuration as code (todo en git)
      - [ ] Runbook de DR documentado
      - [ ] DR drill trimestral (simulacro)

- [ ] Graceful degradation:
      - [ ] Orchestrator sin Redis: modo sync
      - [ ] Runner sin Orchestrator: queue local
      - [ ] Studio sin internet: modo offline
```

### Quality Gate Fase 5
```
[ ] Health checks responden correctamente
[ ] Logs estructurados con correlation IDs
[ ] Dashboards Grafana operativos
[ ] Alertas configuradas y probadas
[ ] Backup/restore verificado
[ ] DR drill ejecutado exitosamente
[ ] Graceful shutdown funciona (0 lost executions)
```

---

## FASE 6: Certification & Hardening (Semanas 21-24)

**Objetivo**: Preparar para auditorias externas y certificaciones.

### 6.1 Penetration Testing

```
Tareas:
- [ ] Contratar firma externa de pentest
- [ ] Scope: Orchestrator API, Control Plane API, Studio
- [ ] Tipos:
      - Black box (sin acceso al codigo)
      - Grey box (con credenciales)
      - White box (con acceso al codigo)
- [ ] Remediar TODOS los findings HIGH/CRITICAL
- [ ] Re-test despues de remediacion
- [ ] Documentar findings y remediaciones
```

### 6.2 Load Testing

**Problema**: INF-009

```
Tareas:
- [ ] Escenarios de carga:
      - [ ] 500 usuarios concurrentes en Orchestrator UI
      - [ ] 1000 req/s al API
      - [ ] 50 runners ejecutando simultaneamente
      - [ ] 10,000 ejecuciones/hora
      - [ ] 100 WebSocket conexiones con streaming

- [ ] Stress testing:
      - [ ] Incrementar hasta breaking point
      - [ ] Documentar limites
      - [ ] Verificar graceful degradation (no crash)

- [ ] Soak testing:
      - [ ] 24 horas a 50% capacidad
      - [ ] Verificar no memory leaks
      - [ ] Verificar no connection leaks
      - [ ] Verificar no disk leaks
```

### 6.3 Compliance Documentation

```
Tareas:
- [ ] SOC2 Type II prep:
      - [ ] Documentar todos los controles
      - [ ] Evidencia de logging y monitoring
      - [ ] Evidencia de access control
      - [ ] Evidencia de change management
      - [ ] Evidencia de incident response

- [ ] HIPAA prep:
      - [ ] BAA template
      - [ ] PHI handling documentation
      - [ ] Evidence Pack como prueba de compliance
      - [ ] Risk assessment document

- [ ] GDPR prep:
      - [ ] Data Processing Agreement template
      - [ ] Data flow diagrams
      - [ ] DPIA (Data Protection Impact Assessment)
      - [ ] Right to erasure implementation
      - [ ] Data portability implementation
```

### 6.4 Code Signing & Distribution

**Problema**: STU-012, STU-013

```
Tareas:
- [ ] Obtener code signing certificates:
      - [ ] Apple Developer ID (macOS)
      - [ ] Microsoft Authenticode (Windows)
      - [ ] GPG key para Linux packages

- [ ] CI/CD de releases:
      - [ ] Build automatico en tag
      - [ ] Firma automatica de binarios
      - [ ] Notarization (macOS)
      - [ ] Auto-update via Tauri updater
      - [ ] Changelog automatico (conventional commits)
      - [ ] Release notes en GitHub Releases

- [ ] Distribution:
      - [ ] DMG para macOS
      - [ ] MSI/NSIS para Windows
      - [ ] AppImage/deb/rpm para Linux
      - [ ] Auto-update check on startup
```

### 6.5 Refactoring de Deuda Tecnica

```
Tareas:
- [ ] FlowEditor.tsx (9,600 LOC -> max 500 LOC por archivo):
      - [ ] Extraer: FlowCanvas, FlowToolbar, FlowContextMenu
      - [ ] Extraer: useFlowDragDrop, useFlowKeyboard, useFlowClipboard
      - [ ] Extraer: EdgeRenderer, NodeRenderer

- [ ] nodeTemplates.ts (10,000 LOC -> archivos por categoria):
      - [ ] web.templates.ts
      - [ ] desktop.templates.ts
      - [ ] excel.templates.ts
      - [ ] ai.templates.ts
      - [ ] control.templates.ts
      - [ ] (uno por categoria, ~23 archivos)
      - [ ] Index que re-exporta todo

- [ ] registry.py (2,700 LOC -> archivos por categoria):
      - [ ] web_nodes.py
      - [ ] desktop_nodes.py
      - [ ] excel_nodes.py
      - [ ] ai_nodes.py
      - [ ] (uno por categoria)
      - [ ] registry.py solo importa y registra

- [ ] main_v2.robot.j2 (4,337 LOC -> partials):
      - [ ] _web_keywords.j2
      - [ ] _excel_keywords.j2
      - [ ] _control_flow.j2
      - [ ] _ai_keywords.j2
      - [ ] (un partial por categoria)
      - [ ] main_v2.robot.j2 solo incluye partials
```

### Quality Gate Fase 6 (FINAL)
```
[ ] Pentest: 0 HIGH/CRITICAL findings
[ ] Load test: Soporta 1000 req/s con p99 <500ms
[ ] Soak test: 24h sin memory/connection leaks
[ ] SOC2 controles documentados
[ ] HIPAA controles documentados
[ ] GDPR controles documentados
[ ] Code signing funcional (macOS + Windows)
[ ] Auto-update funcional
[ ] Deuda tecnica: 0 archivos >1000 LOC
[ ] Toda la documentacion actualizada
```

---

## Metricas de Exito (Dashboard Continuo)

### Testing

| Metrica | Actual | Meta Fase 2 | Meta Final |
|---------|:------:|:-----------:|:----------:|
| Engine unit test coverage | 60% | 85% | 90% |
| Studio store coverage | 10% | 80% | 90% |
| Studio component coverage | 5% | 70% | 80% |
| Orchestrator API coverage | 30% | 80% | 85% |
| Control Plane API coverage | 20% | 75% | 80% |
| Runner coverage | 25% | 75% | 80% |
| Integration tests | 0 | 20+ | 50+ |
| E2E tests | 0 | 4+ | 15+ |
| Flaky test rate | N/A | <1% | 0% |

### Quality

| Metrica | Actual | Meta |
|---------|:------:|:----:|
| SAST findings (high/critical) | Unknown | 0 |
| SCA vulnerabilities (high/critical) | Unknown | 0 |
| DAST findings (high/critical) | Unknown | 0 |
| Lint errors | Unknown | 0 |
| Type errors | Unknown | 0 |
| Archivos >1000 LOC | 4+ | 0 |

### Operations

| Metrica | Actual | Meta |
|---------|:------:|:----:|
| API availability | N/A | 99.9% |
| API latency p99 | N/A | <500ms |
| Mean time to detect (MTTD) | N/A | <5 min |
| Mean time to resolve (MTTR) | N/A | <4 hrs |
| Recovery time objective (RTO) | N/A | <4 hrs |
| Recovery point objective (RPO) | N/A | <1 hr |

### CI/CD

| Metrica | Actual | Meta |
|---------|:------:|:----:|
| CI pipeline duration | N/A | <15 min |
| Deploy frequency | Manual | On merge |
| Change failure rate | Unknown | <5% |
| Lead time for changes | Days | <1 day |

---

## Dependencias y Riesgos del Plan

### Dependencias Externas

| Dependencia | Para Que | Alternativa |
|-------------|----------|-------------|
| Code signing cert (Apple) | macOS distribution | TestFlight internal |
| Code signing cert (MS) | Windows distribution | Self-signed + warning |
| Pentest firm | Fase 6 | Internal security review |
| Cloud provider | Staging/prod | Docker local |
| Grafana/Prometheus | Monitoring | Console logging |

### Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|:------------:|:-------:|------------|
| Control flow nodes mas complejos de lo esperado | MEDIA | ALTO | Prototipar primero con tests |
| Refactoring introduce regresiones | MEDIA | MEDIO | Tests primero (Fase 2 antes de Fase 6) |
| CI/CD toma mas tiempo | BAJA | BAJO | Empezar simple, iterar |
| Pentest encuentra vulnerabilidades criticas | MEDIA | ALTO | SAST/DAST interno primero |
| Evidence Pack performance en volumen | MEDIA | MEDIO | Benchmark en Fase 3 |

---

## Prioridad de Ejecucion (Si hay Recursos Limitados)

Si solo puedes hacer **5 cosas**, haz estas en orden:

1. **CI pipeline basico** (Fase 1.3) - Sin esto, todo lo demas es fragil
2. **Tests del Engine** (Fase 2.1) - El Engine es el corazon
3. **Control flow nodes** (Fase 4.3) - Sin esto, bots complejos son imposibles
4. **Integration test E2E** (Fase 3.4) - Valida que todo funciona junto
5. **Evidence Pack automatico** (Fase 4.2) - El diferenciador enterprise

Todo lo demas es importante pero estas 5 son existenciales.

---

## Definicion de "Done" - Enterprise-Grade

La plataforma se considera enterprise-grade cuando:

```
[ ] TESTING
    [ ] >80% cobertura en todos los componentes
    [ ] 0 tests flaky
    [ ] Integration tests cubren todos los flujos criticos
    [ ] E2E tests cubren happy path + error paths
    [ ] Performance baselines establecidos y no regresan

[ ] CI/CD
    [ ] Pipeline ejecuta en cada PR
    [ ] Merge bloqueado si CI falla
    [ ] Releases automaticos con firma
    [ ] Auto-update funcional

[ ] SECURITY
    [ ] 0 SAST/DAST/SCA high/critical
    [ ] Pentest passed
    [ ] Rate limiting activo
    [ ] Input validation global
    [ ] Tenant isolation verificada

[ ] COMPLIANCE
    [ ] Evidence Pack genera automaticamente
    [ ] Audit trail inmutable y verificable
    [ ] PII/PHI redactado en logs y screenshots
    [ ] Retention policies funcionales
    [ ] SOC2/HIPAA/GDPR controles documentados

[ ] OBSERVABILITY
    [ ] Structured logging con correlation IDs
    [ ] Metricas Prometheus exportadas
    [ ] Dashboards Grafana operativos
    [ ] Alertas configuradas y probadas
    [ ] Health checks en todos los servicios

[ ] RESILIENCE
    [ ] Graceful shutdown en todos los servicios
    [ ] Backup/restore verificado
    [ ] DR drill ejecutado
    [ ] Graceful degradation implementada

[ ] CODE QUALITY
    [ ] 0 lint errors
    [ ] 0 type errors
    [ ] 0 archivos >1000 LOC
    [ ] Documentacion actualizada
```

Cuando TODOS estos checkboxes esten marcados, SkuldBot es enterprise-grade.

---

*Documento generado por Lico - (c) 2026 Skuld, LLC*
