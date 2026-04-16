# Work Protocol (Luis + Albert)

Fecha: 2026-04-16
Estado: obligatorio
Ambito: toda tarea tecnica, toda PR, todo merge a `master`

Este protocolo convierte instrucciones en controles verificables.
No se confia en memoria o buena voluntad; se confia en gates y evidencia.

## 1. Prioridad de reglas

Si hay conflicto, el orden de prioridad es:

1. Seguridad y compliance (`docs/REGULATORY_DESIGN_GUARDRAILS.md`)
2. Quality Gate (`docs/ENGINEERING_STANDARDS.md`)
3. Scope de la tarea acordada (in-scope / out-of-scope)
4. Estilo y preferencia de implementacion

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

## 5. Quality Gates obligatorios (QG1-QG9)

Un PR solo se puede mergear si cumple todos los gates aplicables.

- `QG1 Build`: `turbo run build` (o build del modulo) sin errores.
- `QG2 Tests`: unit/integration del modulo pasan; cobertura no decrece.
- `QG3 Contratos/E2E`: para flujos con contratos o integraciones criticas, test de flujo completo pasa.
- `QG4 Lint + Typecheck`: 0 errores nuevos (`lint`, `typecheck`, `ruff`, `mypy` segun stack).
- `QG5 Security Baseline`: sin runtime mocks, sin secrets hardcoded, inputs validados, consultas seguras.
- `QG6 CI Smoke`: jobs de CI requeridos en verde.
- `QG7 Review + DoD`: review bidireccional y DoD del modulo completo.
- `QG8 Compliance Check`: sin defaults inseguros para secretos, vault/platform injection documentada, data minimization.
- `QG9 Nexion Parity` (solo migraciones): paridad funcional requerida para el scope de migracion sin blockers abiertos.

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
