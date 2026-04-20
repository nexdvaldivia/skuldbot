# SkuldBot Engineering Standards

**Fecha**: 2026-04-14
**Version**: 1.0
**Aprobado por**: Dubiel Valdivia (Owner), Albert (Arquitectura), Luis (Desarrollo)
**Aplica a**: Todo el codigo, toda PR, todo deploy, todo modulo — sin excepciones.

---

## Principio Rector

> Calidad primero, sin presion de calendario.
> Cada linea de codigo debe ser digna de una plataforma enterprise.
> No hay atajos. No hay "despues lo mejoramos".

---

## 1. Quality Gate Obligatorio

**Ningun merge a master sin pasar Quality Gate.**

Cada PR debe cumplir TODOS estos criterios antes de merge:

| Criterio | Herramienta | Umbral |
|----------|-------------|--------|
| Build | `turbo run build` | 0 errores |
| Tests unitarios | `turbo run test` / `pytest` | Pasan, cobertura no decrece |
| Tests de integracion | Por modulo | Pasan para modulos con contratos |
| Lint critico | `turbo run lint` / `ruff check` | 0 errores NUEVOS (lint-staged) |
| Type check | `turbo run typecheck` / `mypy` | 0 errores NUEVOS |
| Seguridad minima | SAST (cuando activo) | 0 high/critical nuevos |
| Smoke deploy | CI pipeline | Build job completa |
| Code review | Bidireccional (Albert ↔ Luis) | 1 aprobacion minima |

**Sin excepciones.** Si el QG falla, la PR no se mergea. Se arregla y se re-ejecuta.

---

## 2. Architecture Decision Records (ADR)

**Todo cambio grande requiere un ADR escrito y versionado.**

### Que es "cambio grande"

- Agregar o eliminar un modulo completo
- Cambiar una dependencia core (framework, DB, provider)
- Modificar el modelo de datos de una entidad critica
- Cambiar un patron arquitectonico (e.g., cambiar de REST a GraphQL)
- Decisiones de seguridad (algoritmos de encryption, auth flows)
- Decisiones de infraestructura (cloud provider, deployment strategy)

### Formato ADR

Ubicacion: `docs/adr/XXXX-titulo.md`

```markdown
# ADR-XXXX: Titulo de la Decision

**Fecha**: YYYY-MM-DD
**Estado**: Propuesto | Aceptado | Reemplazado por ADR-YYYY
**Autor**: Nombre

## Contexto
Que problema estamos resolviendo y por que ahora.

## Decision
Que decidimos hacer.

## Alternativas Consideradas
Que otras opciones evaluamos y por que las descartamos.

## Consecuencias
Que cambia como resultado de esta decision.
Que riesgos introduce.
Que deuda tecnica genera o resuelve.

## Implementacion
Archivos/modulos afectados.
Orden de ejecucion si aplica.
```

### Proceso

1. Autor escribe ADR y lo sube como PR (solo el doc)
2. Equipo revisa y comenta
3. Se aprueba o se ajusta
4. Implementacion comienza DESPUES de aprobacion

---

## 3. Testing por Modulo

**Todo modulo nuevo debe tener contratos + tests de integracion, no solo unit tests.**

### Piramide de Tests

```
          ╱╲
         ╱E2E╲          (Pocos, criticos: flujo completo)
        ╱──────╲
       ╱Integra-╲       (Cada modulo: API + DB + providers)
      ╱──cion────╲
     ╱─────────────╲
    ╱  Unit Tests    ╲   (Cada servicio: logica aislada)
   ╱──────────────────╲
```

### Requisitos por tipo de modulo

**Modulos Backend (NestJS)**:
- Unit tests: Cada service method con mocks de dependencias
- Integration tests: Controller → Service → DB real (PostgreSQL en CI)
- Contract tests: Si el modulo se comunica con otro servicio (CP ↔ Orchestrator)
- Cobertura minima: 80% en logica de negocio, 60% general

**Modulos Frontend (React/Next.js)**:
- Component tests: Render, interacciones, estados (React Testing Library)
- Store tests: Cada store con 100% de acciones testeadas
- Snapshot tests: Componentes UI criticos
- No se requiere E2E per-modulo (eso va en el flujo E2E global)

**Modulos Python (Engine/Runner)**:
- Unit tests: pytest con mocks
- Integration tests: Compilar + ejecutar bot real con Robot Framework
- Cobertura minima: 85%

### Definition of Done (DoD) por Modulo

Un modulo se considera "done" cuando:

- [ ] Codigo implementado y funcional
- [ ] Unit tests pasan (cobertura minima cumplida)
- [ ] Integration tests pasan (API + DB)
- [ ] Contract tests pasan (si aplica comunicacion inter-servicio)
- [ ] Lint: 0 errores en archivos del modulo
- [ ] TypeCheck: 0 errores en archivos del modulo
- [ ] ADR escrito (si es modulo nuevo o cambio grande)
- [ ] API documentada (decoradores Swagger/OpenAPI)
- [ ] Code review aprobado
- [ ] QG pasa

---

## 4. Zero Quick-Fix en Produccion

**Hardening y observabilidad van en el mismo PR funcional.**

### Que significa esto

Cuando implementas una feature, el PR debe incluir:

| Feature | Debe incluir tambien |
|---------|---------------------|
| Nuevo endpoint API | Rate limiting, validacion de inputs, error handling, audit log |
| Nueva entidad DB | Migracion, indices, soft delete si aplica |
| Nuevo servicio | Health check, metricas (si es critico), structured logging |
| Nuevo provider | Retry logic, timeout config, fallback |
| Nueva pagina UI | Loading states, error states, empty states, responsive |

### Lo que NO se acepta

- PR que agrega feature sin tests → **Rechazado**
- PR que agrega endpoint sin validacion de inputs → **Rechazado**
- PR que agrega servicio sin error handling → **Rechazado**
- PR que "funciona en mi maquina" sin verificacion en CI → **Rechazado**
- PR que dice "tests en otro PR" → **Rechazado**

### Excepciones

Solo hay UNA excepcion: **hotfix de seguridad critico** (vulnerabilidad activa en produccion).
En ese caso:
1. Fix inmediato con PR expedito
2. Tests y hardening en PR de follow-up dentro de 24 horas
3. Post-mortem documentado

---

## 5. Marketplace — Flujo Estricto

**Todo bot en el marketplace sigue el flujo: draft → certification → approved → published.**

### Flujo para Bots Internos (Skuld/Nexion)

```
Desarrollador crea bot
  → Draft (editable, no visible)
  → Certification (QA interno: funciona, compliance, evidence pack)
  → Approved (listo para publicar)
  → Published (visible en marketplace)
```

### Flujo para Bots de Partners

```
Partner aplica al programa
  → Skuld revisa solicitud
  → Aprobado → canPublishToMarketplace = true
  → Partner sube bot
  → Draft (solo visible para el partner)
  → Submitted (entra a cola de review de Skuld)
  → In Review (equipo Skuld evalua)
  → Certified / Rejected (con feedback)
  → Si Certified → Published
  → Si Rejected → Partner corrige y re-submite
```

### Criterios de Certificacion

- [ ] Bot compila y ejecuta sin errores
- [ ] Evidence Pack se genera correctamente
- [ ] No hay hardcoded secrets o PII
- [ ] Cumple con policy packs declarados (HIPAA, SOC2, etc.)
- [ ] Documentacion minima (descripcion, requisitos, configuracion)
- [ ] Versionado semantico
- [ ] Compatible con version minima del Runtime declarada

### Lo que NO se acepta

- Bot sin Evidence Pack → **Rechazado**
- Bot con secrets en el package → **Rechazado**
- Bot sin documentacion → **Rechazado**
- Bot que falla en compilacion → **Rechazado**
- Partner no aprobado sube bot → **Bloqueado por sistema**

---

## 6. Reglas de UI

**Todo diseno sigue los principios de Refactoring UI (Adam Wathan & Steve Schoger).**

### Principios obligatorios

1. **Jerarquia por peso y color**, no por tamano de fuente
2. **Spacing scale constrained**: 4, 8, 12, 16, 24, 32, 48, 64
3. **Color palette limitada**: sistema existente (Zinc/Slate + Emerald + semanticos)
4. **Menos borders, mas sombras y spacing** para separar secciones
5. **Empty states disenados** como primera impresion
6. **Datos reales primero**, nunca placeholders o mock data
7. **Tipografia con proposito**: max 2 font sizes por seccion
8. **No romper diseno existente**: el design system (Shadcn + Radix + Tailwind) se mantiene

### Review de UI

Toda PR con cambios de UI se revisa contra estos principios.
Si un cambio rompe la consistencia visual → **Rechazado**.

---

## 7. Seguridad — No Negociables

Estos aplican SIEMPRE, en cada PR, sin excepcion:

- **NUNCA** almacenar passwords en texto plano (argon2id obligatorio)
- **NUNCA** logs con datos sensibles (PII/PHI redactados automaticamente)
- **NUNCA** secrets hardcoded en codigo (usar vault/env vars)
- **NUNCA** endpoint sin validacion de inputs
- **NUNCA** query SQL sin parametrizacion
- **SIEMPRE** principio de minimo privilegio
- **SIEMPRE** encryption de datos sensibles en reposo
- **SIEMPRE** HTTPS en transito (TLS 1.2+)
- **SIEMPRE** audit log de operaciones sensibles

Si un reviewer encuentra una violacion de seguridad en un PR → **Rechazo inmediato**.

---

## 8. Commits y Branches

### Conventional Commits (obligatorio)

```
feat: nueva funcionalidad
fix: correccion de bug
test: agregar o modificar tests
ci: cambios en CI/CD
refactor: reestructuracion sin cambio funcional
docs: documentacion
style: formateo (no logica)
perf: mejora de performance
security: fix o mejora de seguridad
```

### Branch Naming

```
feat/S{sprint}-XX-descripcion-corta
fix/S{sprint}-XX-descripcion-corta
test/S{sprint}-XX-descripcion-corta
refactor/descripcion-corta
hotfix/descripcion-corta
```

### Reglas de Git

- Un PR por tarea
- PRs pequenos, faciles de revisar (max ~500 LOC de cambio real)
- Nunca force push a master
- Nunca skip hooks (`--no-verify`)
- Siempre worktree limpio desde master (nunca el working tree sucio)

---

## 9. Code Review — Bidireccional

| Reviewer | Revisa | Foco |
|----------|--------|------|
| Albert | Codigo de Luis | Arquitectura, patrones, UI, seguridad |
| Luis | Codigo de Albert | Logica, performance, edge cases, tests |

### Checklist de Review

- [ ] Cumple con el QG (build, tests, lint)
- [ ] Sigue los principios de seguridad
- [ ] Tests cubren la logica nueva
- [ ] No introduce deuda tecnica innecesaria
- [ ] ADR escrito si aplica
- [ ] Documentacion actualizada si aplica
- [ ] UI sigue principios de Refactoring UI (si tiene cambios de UI)
- [ ] No rompe funcionalidad existente

---

## 10. Comunicacion del Equipo

| Rol | Responsabilidad |
|-----|----------------|
| **Dubiel** (Owner) | Prioridades, aprobacion de direccion, decisiones de negocio |
| **Albert** (AI Architect) | Arquitectura, toda la UI, code review, quality gates |
| **Luis** (Developer) | Backend, infra, testing, CI/CD, deployments, code review |

### Reglas

- Luis ejecuta instrucciones completas y reporta resultado. No pregunta cada paso.
- Albert revisa profundo (0-defecto, enterprise-grade). No aprueba sin verificar.
- Decisiones de arquitectura se documentan como ADR.
- Progreso se reporta en formato estandar (barra + tablas).

---

## Versionado de este Documento

| Version | Fecha | Cambio |
|---------|-------|--------|
| 1.0 | 2026-04-14 | Creacion inicial — reglas fundacionales |

Este documento es **vinculante**. Cualquier cambio requiere aprobacion del equipo completo.

---

*(c) 2026 Skuld, LLC — Una empresa de Asgard Insight*
