# SkuldBot Zero-Defect Backlog

**Fecha**: 2026-04-11
**Gestion**: Albert (Arquitectura, UI, Code Review) | Luis (Desarrollo)
**Referencia**: `docs/PLATFORM_AUDIT_2026.md` | `docs/ZERO_DEFECT_PLAN.md`

---

## Para Luis - Contexto

Hola Luis. Soy Albert, el arquitecto del proyecto SkuldBot.

Hicimos una auditoria completa de la plataforma y encontramos **47 defectos** que nos
impiden ser enterprise-grade. El plan tiene 6 fases y ~24 semanas. Tu rol es implementar
las tareas del backlog. Yo me encargo de la arquitectura, la parte de UI, y reviso todo
tu codigo antes de merge.

### Reglas de trabajo

1. **Cada tarea tiene un Definition of Done (DoD)** - no se cierra hasta cumplirlo
2. **Code review bidireccional** - Albert revisa el codigo de Luis, Luis revisa el de Albert
3. **Tests primero** - si una tarea dice "agregar tests", los tests van ANTES del codigo
4. **Un PR por tarea** - PRs pequenos, faciles de revisar
5. **Conventional commits** - `feat:`, `fix:`, `test:`, `ci:`, `refactor:`, `docs:`
6. **Branch naming** - `feat/ZD-XXX-descripcion-corta` (ZD = Zero Defect)

### Como leer este backlog

- **ZD-XXX**: ID de tarea (Zero Defect)
- **Asignado**: Luis (L) o Albert (A) o Ambos (L+A)
- **Bloquea**: tareas que dependen de esta
- **Requiere**: tareas que deben completarse primero
- **Esfuerzo**: S (1-2 dias), M (3-5 dias), L (1-2 semanas), XL (2+ semanas)

---

## FASE 1: Foundation (Semanas 1-3)

> Sin esta base, todo lo demas se construye sobre arena.

### Sprint 1.1 - Monorepo y Tooling (Semana 1)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-001 | Instalar pnpm y crear pnpm-workspace.yaml | L | S | - | ZD-002 |
| ZD-002 | Instalar Turborepo y crear turbo.json con pipelines build/test/lint/typecheck | L | S | ZD-001 | ZD-003 |
| ZD-081 | Consolidar Runner: eliminar FastAPI web UI duplicada, runner-app Tauri como unico frontend | L+A | M | ZD-002 | ZD-003 |
| ZD-003 | Migrar apps/studio a pnpm | L | S | ZD-081 | ZD-007 |
| ZD-004 | Migrar apps/orchestrator/api y ui a pnpm | L | S | ZD-081 | ZD-007 |
| ZD-005 | Migrar apps/control-plane/api y ui a pnpm | L | S | ZD-081 | ZD-007 |
| ZD-006 | Migrar libs/compiler a pnpm | L | S | ZD-081 | ZD-007 |
| ZD-007 | Verificar `turbo run build` compila todo | L | S | ZD-003..006 | ZD-010 |

<details>
<summary><strong>ZD-081: Consolidar Runner (eliminar duplicacion Tauri + FastAPI)</strong> (click para expandir)</summary>

**Objetivo**: Eliminar la duplicacion entre `apps/runner-app/` (Tauri desktop UI) y
`services/runner/src/skuldbot_runner/web/` (FastAPI web UI). El Runner debe seguir el
mismo patron que Studio: Tauri frontend + Python motor.

**Contexto**: Actualmente existen dos UIs para el Runner:
- `apps/runner-app/` — Tauri + React (desktop app, igual que Studio)
- `services/runner/web/` — FastAPI + templates (web UI embebida)

Ambas hacen lo mismo: mostrar estado del runner, ejecuciones, logs. Mantener dos
UIs es deuda tecnica y garantia de divergencia.

**Arquitectura objetivo**:
```
apps/runner-app/          ← Tauri frontend (UNICO UI del Runner)
  └── src-tauri/          ← Rust: invoca services/runner/ como motor

services/runner/          ← Python: agente headless puro
  ├── agent.py            ← Polling del Orchestrator
  ├── executor.py         ← Ejecucion de bots
  ├── api_client.py       ← Comunicacion con Orchestrator
  ├── cli.py              ← CLI para modo headless
  └── web/                ← ELIMINAR
```

**Pasos**:
1. Eliminar `services/runner/src/skuldbot_runner/web/` (templates, static, app.py)
2. Eliminar dependencias FastAPI/uvicorn del `pyproject.toml` del runner
3. Verificar que `services/runner/` funciona como agente headless (CLI + polling)
4. Verificar que `apps/runner-app/` Tauri puede invocar al runner Python
5. Actualizar documentacion que referencie el web UI eliminado

**DoD**:
- [ ] `services/runner/src/skuldbot_runner/web/` eliminado
- [ ] FastAPI/uvicorn removidos de dependencias del runner
- [ ] `skuldbot-runner` CLI sigue funcionando sin web UI
- [ ] `apps/runner-app/` es el unico frontend del Runner
- [ ] Documentacion actualizada
- [ ] 0 referencias al web UI eliminado en el codebase

**Branch**: `refactor/ZD-081-consolidate-runner`
**Commit**: `refactor(runner): remove duplicate FastAPI web UI, consolidate to Tauri app`

</details>

<details>
<summary><strong>ZD-001: Instalar pnpm y crear pnpm-workspace.yaml</strong> (click para expandir)</summary>

**Objetivo**: Unificar el package manager del monorepo con pnpm.

**Pasos**:
1. Instalar pnpm globalmente: `npm install -g pnpm`
2. Crear `pnpm-workspace.yaml` en la raiz del proyecto:
   ```yaml
   packages:
     - 'apps/*'
     - 'apps/*/api'
     - 'apps/*/ui'
     - 'libs/*'
     - 'services/*'
   ```
3. Crear `.npmrc` en la raiz:
   ```
   auto-install-peers=true
   strict-peer-dependencies=false
   shamefully-hoist=true
   ```
4. Eliminar `package-lock.json` de cada app (si existe)
5. Ejecutar `pnpm install` desde la raiz
6. Verificar que cada app resuelve sus dependencias

**DoD**:
- [ ] `pnpm-workspace.yaml` existe en raiz
- [ ] `.npmrc` existe en raiz
- [ ] `pnpm install` ejecuta sin errores desde raiz
- [ ] `pnpm ls --depth=0` muestra todas las apps/libs
- [ ] No quedan `package-lock.json` (solo `pnpm-lock.yaml`)

**Branch**: `feat/ZD-001-pnpm-workspace`
**Commit**: `ci: initialize pnpm workspace for monorepo`

</details>

### Sprint 1.2 - Linting y Formatting (Semana 2)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-008 | Configurar ESLint compartido en raiz (flat config) | L | M | ZD-007 | ZD-010 |
| ZD-009 | Configurar Prettier compartido en raiz | L | S | ZD-007 | ZD-010 |
| ZD-010 | Ejecutar formateo masivo en todo el proyecto TS | L | S | ZD-008, ZD-009 | ZD-012 |
| ZD-011 | Configurar Ruff + mypy para Python (engine + runner) | L | M | - | ZD-012 |
| ZD-012 | Instalar Husky + lint-staged para pre-commit hooks | L | S | ZD-010, ZD-011 | ZD-013 |

<details>
<summary><strong>ZD-008: ESLint compartido</strong></summary>

**Objetivo**: Un solo config de ESLint para todos los proyectos TypeScript.

**Pasos**:
1. Crear `eslint.config.js` en raiz (flat config ESLint 9+)
2. Plugins: `@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`
3. Reglas minimas obligatorias:
   - `no-unused-vars: error`
   - `@typescript-eslint/no-explicit-any: warn` (warn primero, error despues)
   - `@typescript-eslint/no-unused-vars: error`
   - `react-hooks/rules-of-hooks: error`
   - `react-hooks/exhaustive-deps: warn`
4. Cada app puede extender con reglas propias en su eslint.config.js
5. Agregar script en raiz: `"lint": "turbo run lint"`
6. Correr lint y documentar cuantos errores hay (no corregir aun, eso es ZD-010)

**DoD**:
- [ ] `eslint.config.js` en raiz
- [ ] `turbo run lint` ejecuta en todas las apps TS
- [ ] Reporte de errores documentado
- [ ] Cada app tiene script `"lint"` en su package.json

**Branch**: `feat/ZD-008-eslint-config`

</details>

<details>
<summary><strong>ZD-011: Ruff + mypy para Python</strong></summary>

**Objetivo**: Linting y type checking para engine y runner.

**Pasos**:
1. En `services/engine/pyproject.toml` agregar:
   ```toml
   [tool.ruff]
   target-version = "py310"
   line-length = 100
   select = ["E", "F", "W", "I", "N", "UP", "S", "B", "A", "C4", "SIM"]
   ignore = ["E501"]  # line length manejado por formatter

   [tool.ruff.format]
   quote-style = "double"

   [tool.mypy]
   python_version = "3.10"
   warn_return_any = true
   warn_unused_configs = true
   ignore_missing_imports = true  # temporalmente
   ```
2. Lo mismo en `services/runner/pyproject.toml`
3. Crear scripts:
   - `ruff check .` (lint)
   - `ruff format .` (format)
   - `mypy skuldbot/` (type check)
4. Ejecutar y documentar findings (no corregir aun)

**DoD**:
- [ ] Ruff configurado en engine y runner
- [ ] mypy configurado en engine y runner
- [ ] `ruff check .` ejecuta (puede tener warnings)
- [ ] `mypy` ejecuta (puede tener errors)
- [ ] Reporte de findings documentado

**Branch**: `feat/ZD-011-ruff-mypy`

</details>

### Sprint 1.3 - CI/CD y Docker (Semana 3)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-013 | Crear workflow CI en GitHub Actions (lint + typecheck + test + build) | L | M | ZD-012 | ZD-015 |
| ZD-014 | Crear docker-compose.dev.yml (PostgreSQL + Redis + MinIO) | L | M | - | ZD-020 |
| ZD-015 | Configurar branch protection en main | L | S | ZD-013 | - |
| ZD-016 | Crear script ./scripts/dev-setup.sh (one-command setup) | L | S | ZD-014 | - |

<details>
<summary><strong>ZD-013: CI Pipeline</strong></summary>

**Objetivo**: Ningun PR se mergea sin validacion automatica.

**Archivo**: `.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]

jobs:
  lint-ts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint

  lint-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install ruff mypy
      - run: cd services/engine && ruff check .
      - run: cd services/runner && ruff check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run typecheck

  test-engine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: cd services/engine && pip install -e ".[dev]"
      - run: cd services/engine && pytest --cov=skuldbot

  test-ts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run test

  build:
    runs-on: ubuntu-latest
    needs: [lint-ts, lint-python, typecheck, test-engine, test-ts]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run build
```

**DoD**:
- [ ] Workflow ejecuta en cada PR
- [ ] Jobs paralelos: lint-ts, lint-python, typecheck, test-engine, test-ts
- [ ] Build solo corre si todo lo anterior pasa
- [ ] Caching de pnpm y pip funciona
- [ ] CI pasa en verde en un PR de prueba

**Branch**: `feat/ZD-013-ci-pipeline`

</details>

<details>
<summary><strong>ZD-014: Docker Compose dev</strong></summary>

**Objetivo**: Un comando levanta todo el stack de desarrollo.

**Archivo**: `docker-compose.dev.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: skuld
      POSTGRES_PASSWORD: skuld_dev
      POSTGRES_DB: skuldbot
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U skuld"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

**DoD**:
- [ ] `docker compose -f docker-compose.dev.yml up -d` levanta los 3 servicios
- [ ] PostgreSQL accesible en localhost:5432
- [ ] Redis accesible en localhost:6379
- [ ] MinIO accesible en localhost:9000 (API) y 9001 (console)
- [ ] `.env.example` actualizado con connection strings

**Branch**: `feat/ZD-014-docker-compose-dev`

</details>

### Quality Gate Fase 1

| Criterio | Verificador |
|----------|:-----------:|
| `turbo run build` pasa | Albert |
| `turbo run lint` - 0 errores | Albert |
| CI pipeline ejecuta en cada PR | Albert |
| docker-compose up levanta stack | Albert |
| Branch protection activa | Albert |
| Husky pre-commit funciona | Albert |

---

## FASE 2: Testing Core (Semanas 4-8)

### Sprint 2.1 - Engine Tests (Semana 4-5)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-017 | Configurar pytest-cov con threshold 85% en CI | L | S | ZD-013 | ZD-018 |
| ZD-018 | Tests de todos los nodos del registry (288 tipos compilan) | L | L | ZD-017 | ZD-025 |
| ZD-019 | Tests de variable transformation (todas las sintaxis) | L | M | ZD-017 | ZD-025 |
| ZD-020 | Tests del Executor (output parsing, callbacks, modos) | L | M | ZD-017 | ZD-025 |
| ZD-021 | Tests del Evidence Pack (writer, encryption, firma, integridad) | L | L | ZD-017 | ZD-030 |

### Sprint 2.2 - Studio Store Tests (Semana 5-6)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-022 | Configurar Vitest + coverage para Studio | L | S | ZD-013 | ZD-023 |
| ZD-023 | Tests de flowStore (CRUD nodos, edges, DSL generation) | L | M | ZD-022 | ZD-027 |
| ZD-024 | Tests de projectStore (create, save, load, manifest) | L | M | ZD-022 | ZD-027 |
| ZD-025 | Tests de debugStore (session lifecycle, breakpoints, execution tracking) | L | M | ZD-022 | ZD-027 |
| ZD-026 | Tests de validationStore, vaultStore, aiPlannerV2Store | L | M | ZD-022 | ZD-027 |
| ZD-027 | Tests de stores restantes (connections, license, history, tabs, toast, logs, navigation) | L | M | ZD-022 | - |

### Sprint 2.3 - Studio Component Tests (Semana 6-7)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-028 | Configurar React Testing Library + snapshot testing | L | S | ZD-022 | ZD-029 |
| ZD-029 | Tests de componentes criticos: CustomNode, NodeConfigPanel, Sidebar, Toolbar | A+L | L | ZD-028 | - |
| ZD-030 | Snapshot tests de componentes UI (ui/) | A | M | ZD-028 | - |

### Sprint 2.4 - Backend Tests (Semana 7-8)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-031 | Tests Orchestrator API: bots, runs, runners services | L | L | ZD-014 | ZD-035 |
| ZD-032 | Tests Orchestrator API: auth, audit, evidence, credentials services | L | L | ZD-014 | ZD-035 |
| ZD-033 | Tests Control Plane API: tenants, licenses, billing, sso | L | L | ZD-014 | ZD-036 |
| ZD-034 | Tests Runner Service: agent, executor, api_client | L | M | ZD-017 | ZD-035 |

### Quality Gate Fase 2

| Criterio | Meta | Verificador |
|----------|:----:|:-----------:|
| Engine coverage | >85% | Albert |
| Studio stores coverage | >80% | Albert |
| Studio components coverage | >70% | Albert |
| Orchestrator API coverage | >80% | Albert |
| Control Plane API coverage | >75% | Albert |
| Runner coverage | >75% | Albert |
| 0 flaky tests | 10/10 pass | Albert |

---

## FASE 3: Integration & E2E (Semanas 9-12)

### Sprint 3.1 - Integration Tests (Semana 9-10)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-035 | Integration tests Engine: compile + ejecutar con Robot Framework real (7 escenarios) | L | L | ZD-018..020 | ZD-039 |
| ZD-036 | Integration tests CP <-> Orchestrator: register, heartbeat, usage ingest | L | L | ZD-031..033 | ZD-039 |
| ZD-037 | Integration tests Orchestrator <-> Runner: dispatch, execute, report | L | L | ZD-031, ZD-034 | ZD-039 |

### Sprint 3.2 - E2E Tests (Semana 10-11)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-038 | Configurar Playwright para E2E del Studio | L | M | ZD-022 | ZD-039 |
| ZD-039 | E2E test: bot simple (create, compile, debug, verify) | L+A | M | ZD-038 | ZD-040 |
| ZD-040 | E2E test: bot con error (fail, catch, verify error UI) | L+A | M | ZD-039 | ZD-041 |
| ZD-041 | E2E test: flujo completo Studio -> Orchestrator -> Runner -> Result | L | L | ZD-040 | - |

### Sprint 3.3 - Performance Baseline (Semana 12)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-042 | Instalar k6 y crear baseline tests para Orchestrator API | L | M | ZD-031 | - |
| ZD-043 | Crear performance tests para Studio canvas (100, 500, 1000 nodos) | A | M | ZD-029 | - |

---

## FASE 4: Security & Compliance (Semanas 13-16)

### Sprint 4.1 - Funcionalidad Critica (Semana 13-14)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-044 | Implementar control.if (condiciones, branching, nested) | L | L | ZD-018 | ZD-049 |
| ZD-045 | Implementar control.loop (iteracion, break, continue, nested) | L | L | ZD-018 | ZD-049 |
| ZD-046 | Implementar control.while (condicion de salida, max iterations) | L | M | ZD-018 | ZD-049 |
| ZD-047 | Implementar control.try_catch (try/catch/finally, propagation) | L | M | ZD-018 | ZD-049 |
| ZD-048 | Implementar control.switch y control.parallel | L | M | ZD-018 | ZD-049 |
| ZD-049 | Integration tests para todos los control flow nodes | L | M | ZD-044..048 | - |

### Sprint 4.2 - Evidence Pack Production (Semana 14-15)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-050 | Integrar EvidencePackWriter automatico en Executor | L | L | ZD-021 | ZD-052 |
| ZD-051 | Endpoint de verificacion de integridad GET /evidence/:id/verify | L | M | ZD-050 | ZD-052 |
| ZD-052 | Tests E2E: ejecutar bot, verificar .evp generado e integro | L | M | ZD-050, ZD-051 | - |

### Sprint 4.3 - Security Hardening (Semana 15-16)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-053 | Configurar Semgrep/CodeQL en CI (SAST) | L | M | ZD-013 | - |
| ZD-054 | npm audit + pip audit + cargo audit en CI (SCA) | L | S | ZD-013 | - |
| ZD-055 | Rate limiting + Helmet + CORS estricto en Orchestrator API | L | M | ZD-031 | - |
| ZD-056 | Rate limiting + tenant isolation tests en Control Plane API | L | M | ZD-033 | - |
| ZD-057 | Request validation global (class-validator pipes) en ambas APIs | L | M | ZD-031, ZD-033 | - |
| ZD-058 | Configurar @nestjs/swagger en Orchestrator y Control Plane | L | M | ZD-031 | - |

---

## FASE 5: Observability & Resilience (Semanas 17-20)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-059 | Health checks (ready/live) en Orchestrator y Control Plane APIs | L | M | ZD-031 | ZD-065 |
| ZD-060 | Health reporting del Runner al Orchestrator (heartbeat + resources) | L | M | ZD-034 | ZD-065 |
| ZD-061 | Structured logging JSON + correlation IDs (X-Trace-Id) | L | L | ZD-031 | ZD-065 |
| ZD-062 | PII auto-redaction interceptor en logs | L | M | ZD-061 | - |
| ZD-063 | Metricas Prometheus en Orchestrator y Runner | L | L | ZD-059 | ZD-065 |
| ZD-064 | Dashboards Grafana (Platform Overview, Execution Analytics) | L | L | ZD-063 | - |
| ZD-065 | Alertas (API down, 0 runners, error rate, Evidence Pack failure) | L | M | ZD-063 | - |
| ZD-066 | Graceful shutdown en todos los servicios | L | M | ZD-059 | - |
| ZD-067 | Backup automatico PostgreSQL + restore verificado | L | M | ZD-014 | - |
| ZD-068 | DR runbook documentado + drill simulado | L+A | M | ZD-067 | - |

---

## FASE 6: Certification & Hardening (Semanas 21-24)

| ID | Tarea | Asignado | Esfuerzo | Requiere | Bloquea |
|----|-------|:--------:|:--------:|----------|---------|
| ZD-069 | OWASP ZAP scan (DAST) contra APIs | L | M | ZD-055 | - |
| ZD-070 | Load test: 1000 req/s Orchestrator API | L | M | ZD-042 | - |
| ZD-071 | Soak test: 24h a 50% capacidad (no leaks) | L | L | ZD-070 | - |
| ZD-072 | Refactor FlowEditor.tsx (9,600 LOC -> sub-componentes max 500 LOC c/u) | A | XL | ZD-029 | - |
| ZD-073 | Refactor nodeTemplates.ts (10,000 LOC -> archivo por categoria) | A | L | ZD-023 | - |
| ZD-074 | Refactor registry.py (2,700 LOC -> archivo por categoria) | L | L | ZD-018 | - |
| ZD-075 | Refactor main_v2.robot.j2 (4,337 LOC -> partials por categoria) | L | L | ZD-018 | - |
| ZD-076 | Code signing certificates (Apple + Microsoft) | L | M | - | ZD-077 |
| ZD-077 | CI/CD de releases: build + firma + auto-update | L | L | ZD-076 | - |
| ZD-078 | SOC2 controles documentados | A | L | ZD-052, ZD-065 | - |
| ZD-079 | HIPAA controles documentados | A | M | ZD-052 | - |
| ZD-080 | GDPR controles documentados (erasure, portability, DPIA) | A | M | ZD-052 | - |
| ZD-082 | Migrar Studio a Tauri 2.x + React 19 (unificar React version en monorepo) | L+A | L | ZD-072 | - |

---

## Resumen de Asignacion

### Luis (L) - 62 tareas

| Fase | Tareas | Esfuerzo estimado |
|------|:------:|:-----------------:|
| Fase 1: Foundation | 16 | 3 semanas |
| Fase 2: Testing | 15 | 5 semanas |
| Fase 3: Integration | 8 | 4 semanas |
| Fase 4: Security | 14 | 4 semanas |
| Fase 5: Observability | 10 | 4 semanas |
| Fase 6: Hardening | 7 | 3 semanas |

### Albert (A) - 10 tareas

| Fase | Tareas | Foco |
|------|:------:|------|
| Fase 2 | 2 | Component tests + snapshots |
| Fase 3 | 2 | E2E tests + performance canvas |
| Fase 5 | 1 | DR runbook |
| Fase 6 | 5 | Refactors UI + compliance docs |

### Colaborativas (L+A) - 8 tareas

E2E tests, component tests, DR drill - trabajo conjunto.

---

## Tracking de Progreso

### Fase 1 Progress: 17/17 COMPLETE (QG closed 2026-04-14)
```
[x] ZD-001  [x] ZD-002  [x] ZD-081  [x] ZD-003
[x] ZD-004  [x] ZD-005  [x] ZD-006  [x] ZD-007
[x] ZD-008  [x] ZD-009  [x] ZD-010  [x] ZD-011
[x] ZD-012  [x] ZD-013  [x] ZD-014  [x] ZD-015
[x] ZD-016
```

### Fase 2 Progress: 0/15
```
[ ] ZD-017  [ ] ZD-018  [ ] ZD-019  [ ] ZD-020
[ ] ZD-021  [ ] ZD-022  [ ] ZD-023  [ ] ZD-024
[ ] ZD-025  [ ] ZD-026  [ ] ZD-027  [ ] ZD-028
[ ] ZD-029  [ ] ZD-030  [ ] ZD-031
```

### Fase 3 Progress: 0/9
```
[ ] ZD-035  [ ] ZD-036  [ ] ZD-037  [ ] ZD-038
[ ] ZD-039  [ ] ZD-040  [ ] ZD-041  [ ] ZD-042
[ ] ZD-043
```

### Fase 4 Progress: 0/15
```
[ ] ZD-044  [ ] ZD-045  [ ] ZD-046  [ ] ZD-047
[ ] ZD-048  [ ] ZD-049  [ ] ZD-050  [ ] ZD-051
[ ] ZD-052  [ ] ZD-053  [ ] ZD-054  [ ] ZD-055
[ ] ZD-056  [ ] ZD-057  [ ] ZD-058
```

### Fase 5 Progress: 0/10
```
[ ] ZD-059  [ ] ZD-060  [ ] ZD-061  [ ] ZD-062
[ ] ZD-063  [ ] ZD-064  [ ] ZD-065  [ ] ZD-066
[ ] ZD-067  [ ] ZD-068
```

### Fase 6 Progress: 0/12
```
[ ] ZD-069  [ ] ZD-070  [ ] ZD-071  [ ] ZD-072
[ ] ZD-073  [ ] ZD-074  [ ] ZD-075  [ ] ZD-076
[ ] ZD-077  [ ] ZD-078  [ ] ZD-079  [ ] ZD-080
```

**Total: 17/82 tareas completadas (20.7%)**

---

*Backlog gestionado por Albert - (c) 2026 Skuld, LLC*
