# Work Protocol (Luis + Albert)

Fecha: 2026-04-16
Estado: obligatorio
Ambito: toda tarea tecnica, toda PR, todo merge a `master`

Este protocolo convierte instrucciones en controles verificables.
No se confia en memoria o buena voluntad; se confia en gates y evidencia.

## 1. Prioridad de reglas

Si hay conflicto, el orden de prioridad es:

1. Compliance-first (`docs/COMPLIANCE_FIRST_POLICY.md`) — prerequisito de todo. No se codifica nada sin compliance.
2. Seguridad y guardrails (`docs/REGULATORY_DESIGN_GUARDRAILS.md`)
3. Quality Gates (`docs/QUALITY_GATE_CHECKLIST.md`)
4. Scope de la tarea acordada (in-scope / out-of-scope)
5. Estilo y preferencia de implementacion

## 2. Handshake obligatorio antes de codificar

Antes de escribir codigo, el responsable debe publicar un **Instruction ACK** con:

- `Task ID` / branch objetivo
- `In scope` (archivos/modulos permitidos)
- `Out of scope` (lo que NO se toca)
- `Gates aplicables` (QG1..QG9)
- `Riesgos` y plan de mitigacion

Si falta este ACK, la tarea se considera no iniciada.

## 3. Formato obligatorio de entrega tecnica

Cada entrega debe incluir estos 4 bloques:

1. `UNDERSTANDING`
2. `PLAN`
3. `CHANGES`
4. `VERIFICATION`

En `VERIFICATION` se reportan comandos ejecutados y resultado (`pass/fail`) con evidencia resumida.

## 4. Reglas operativas de git

- Siempre worktree limpio desde `master`.
- Un branch por tarea.
- Un commit atomico por bloque funcional.
- Prohibido mezclar scope no relacionado en el mismo commit.
- Si hay cambios inesperados en el working tree, se detiene y se reporta.

## 5. Quality Gates de sistema (QG1-QG13)

Un PR solo se puede mergear si cumple todos los gates activos aplicables.
No se permite marcar gates como `n/a` en PR: todos deben declararse en `pass` con evidencia.

La definición completa de cada gate, con checks individuales, comandos y criterios de PASS,
está en `docs/QUALITY_GATE_CHECKLIST.md` (fuente de verdad).

### Gates activos (obligatorios ahora)

- `QG1 Build`: build del módulo + monorepo completo sin errores.
- `QG2 Tests`: unit/integration pasan; suites y count no disminuyen; happy paths presentes.
- `QG3 Contracts/E2E`: contratos API (DTOs), routing order, HTTP status codes, error responses.
- `QG4 Lint + Typecheck`: 0 errores de compilación, 0 TODOs, 0 console.log, TypeORM patterns limpios.
- `QG5 Security Baseline`: 0 secrets hardcoded, input validation, SQL injection, timing-safe, file upload seguro.
- `QG6 CI Smoke`: build y tests en worktree limpio, sin dependencias de estado local.
- `QG7 Review + DoD`: scope respetado, funciones <100 LOC, migrations idempotentes, self-review, threads resueltos.
- `QG8 Compliance Check`: guards + permissions en todos los endpoints, audit events, soft delete, certification-impact flag.
- `QG9 Nexion Parity` (solo migraciones): endpoints, entities, services y comportamiento con paridad Nexion completa.
- `QG-UI` (si toca UI): solo shadcn/ui (0 nativos browser), 0 alert/confirm/prompt, Montserrat, colores Skuld, Refactoring UI (Adam Wathan & Steve Schoger), reutilización obligatoria de componentes existentes, BlockedState vs EmptyState, responsive, accessibility, enterprise quality.
- `QG10 Release Pipeline` (si toca release/deploy): freeze labels, signed images, tag-version match, install matrix, zero patch policy.
- `QG11 Licensing Gate` (si toca licensing/entitlements): dual review, entitlement contract tests, error envelope, dual-key rotation.
- `QG12 Deployer Gates` (si toca deployers): paridad multi-cloud, deployment contract, failure injection, bootstrap sequence.
- `QG13 Runtime Contract` (si toca Runner/workers): parity Runner/API, error codes compartidos, credential guard.

## 5.1 Mandatos adicionales no negociables

Estos mandatos aplican en paralelo a QG1..QG9:

- `Nexion-first reuse`: toda solucion debe copiar/reusar al maximo implementaciones ya existentes en Nexion cuando sean compatibles con el modelo Skuld.
- `UI enterprise`: si hay cambios de UI, se aplican estrictamente principios de Refactoring UI, paleta corporativa Skuld y tipografia Montserrat.
- `Componentes UI`: en UI se usan componentes `shadcn/ui` (no componentes nativos/sistema para experiencias de producto).
- `Mensajeria UI`: feedback al usuario por `toast`; no `alert/confirm/prompt` nativos.
- `Gateway boundary`: el sitio de marketing nunca expone URL directa del Control Plane; toda comunicacion pasa por gateway.
- `Multi-cloud by abstraction`: integraciones de storage/email/sms/payment/infra via interfaces y providers, sin acoplamiento directo del servicio de negocio al cloud concreto.
- `Secrets policy`: secretos en vault/key vault/provider de secretos; `.env` solo minimo local no sensible y nunca defaults inseguros.

## 6. Checklist minimo para PR

Toda PR debe declarar explicitamente:

- Scope (in/out)
- Riesgo
- Gates QG1..QG9
- Evidencia por gate (QG1..QG9), sin placeholders (`TBD`, `pending`, `n/a`)
- Evidencia de pruebas
- Excepciones (si existen)

La plantilla oficial es `.github/pull_request_template.md`.

## 7. Excepciones

Si un gate no puede cumplirse:

1. Se abre excepcion formal con mitigacion y fecha de expiracion.
2. Se documenta en la PR.
3. Requiere aprobacion explicita.

Sin excepcion aprobada, no hay merge.

## 8. Enforcements automáticos

Los siguientes controles deben permanecer activos:

- `.github/workflows/regulatory-guardrails.yml`
- `scripts/regulatory/check-config-guardrails.mjs`
- `scripts/regulatory/check-work-controls.mjs`

Si el pipeline falla, el merge se bloquea.

## 9. Definicion de “instruccion cumplida”

Una instruccion solo se considera cumplida cuando:

- El cambio esta implementado
- Los gates aplicables pasan
- Existe evidencia verificable en PR
- El reviewer aprueba

Todo lo demas es trabajo parcial.
