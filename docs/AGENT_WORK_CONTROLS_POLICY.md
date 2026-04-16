# Agent Work Controls Policy (Skuld)

Fecha: 2026-02-24  
Ámbito: ejecución diaria de cambios en CP + Orchestrator  
Estado: obligatorio

## 1) Objetivo
Evitar regresiones de confianza y cumplimiento aplicando controles verificables al trabajo técnico diario.

## 2) Acuerdos no negociables ya definidos
- Sin mocks en runtime: si una integración no está lista, el flujo debe fallar con error explícito.
- Entornos regulados primero: secretos por vault/proveedor y configuración por DB donde aplique.
- `.env` solo para local/test y controlado por política (`ALLOW_DOTENV`).
- Identidades y claves primarias con `uuid`.
- CP y Orchestrator con RBAC/SSO y principio de mínimo privilegio.
- Protocolo operativo obligatorio (`docs/WORK_PROTOCOL.md`) con Instruction ACK y declaración explícita de QG1..QG9 en cada PR.
- QG1..QG9 se reportan como `pass` con evidencia por gate; no se permite `n/a` en el checklist de calidad.
- Reuso Nexion-first: copiar/adaptar implementaciones Nexion siempre que encajen en el modelo Skuld.
- Integraciones enterprise cloud-agnostic: servicios de negocio solo por interfaces/providers.
- Sitio marketing <-> Control Plane exclusivamente por gateway (no URLs directas de CP expuestas en frontend).
- UI obligatoria con `shadcn/ui`, tipografía Montserrat, colores corporativos Skuld y mensajería por toast (sin `alert/confirm/prompt`).
- Secretos en vault/key vault/provider; `.env` mínimo local y nunca secretos por defecto.

## 3) Controles obligatorios de implementación
- `C-01 No Runtime Mocks`
  - Prohibido introducir `mock/fake/stub` en código runtime de CP/Orchestrator.
  - Si falta integración real: respuesta `fail-fast` con mensaje operativo claro.
- `C-02 No Sensitive Env Fallbacks`
  - Prohibido usar defaults literales para secretos/credenciales (`SECRET`, `PASSWORD`, `TOKEN`, `KEY`, `DB_*USER`, `DB_*PASSWORD`).
- `C-03 Dotenv Regulado`
  - Fuera de `development|local|test`, `ALLOW_DOTENV=true` está prohibido.
- `C-04 Configuración Crítica Requerida`
  - Variables críticas de DB/JWT deben existir; sin fallback silencioso.
- `C-05 Evidencia de Control`
  - Cada cambio debe dejar evidencia automática (CI + tests de política) o falla el merge.

## 4) Pipeline de control (enforcement)
- Script estático de configuración:
  - `scripts/regulatory/check-config-guardrails.mjs`
- Script estático de trabajo diario:
  - `scripts/regulatory/check-work-controls.mjs`
- Workflow de enforcement:
  - `.github/workflows/regulatory-guardrails.yml`
- Template de PR con checklist obligatorio:
  - `.github/pull_request_template.md`

## 5) Checklist operativo antes de cerrar un cambio
- Ejecutar `node scripts/regulatory/check-config-guardrails.mjs`.
- Ejecutar `node scripts/regulatory/check-work-controls.mjs`.
- Ejecutar tests de política en ambos APIs.
- Confirmar que cambios incompletos fallan cerrado (no retornan datos ficticios).

## 6) Manejo de excepciones
- Si un control no puede cumplirse temporalmente:
  - registrar excepción formal con mitigación y fecha de expiración,
  - aprobación por seguridad/compliance,
  - seguimiento activo hasta cierre.
- Sin excepción aprobada, no se libera.
