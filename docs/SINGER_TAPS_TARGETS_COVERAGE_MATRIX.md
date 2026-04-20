# Singer Taps/Targets Coverage Matrix (Studio + Engine)

Fecha de corte: 2026-04-08

## Resumen Ejecutivo

- SkuldBot no busca cubrir el Singer Hub completo; implementa una capa curada de conectores enterprise.
- Cobertura actual del stack, verificada:
  - Studio templates: `29` nodos (`18` taps + `11` targets)
  - Compiler runtime template: `29` nodos (`18` taps + `11` targets)
  - Engine registry: `29` nodos (`18` taps + `11` targets)
- Estado actual:
  - No hay gaps de paridad entre Studio, Compiler y Registry para `data.tap.*` / `data.target.*`.

Fuentes:
- `apps/studio/src/data/nodeTemplates.ts`
- `services/engine/skuldbot/compiler/templates/main_v2.robot.j2`
- `services/engine/skuldbot/nodes/registry.py`

## Matriz De Cobertura Actual

| Familia | Tap | Target | Studio Template | Compiler | Engine Registry | Estado |
|---|---|---|---|---|---|---|
| SQL Server | `data.tap.sqlserver` | `data.target.sqlserver` | SI | SI | SI | COMPLETO |
| Oracle | `data.tap.oracle` | `data.target.oracle` | SI | SI | SI | COMPLETO |
| PostgreSQL | `data.tap.postgres` | `data.target.postgres` | SI | SI | SI | COMPLETO |
| MySQL | `data.tap.mysql` | `data.target.mysql` | SI | SI | SI | COMPLETO |
| DB2 | `data.tap.db2` | `data.target.db2` | SI | SI | SI | COMPLETO |
| Snowflake | `data.tap.snowflake` | `data.target.snowflake` | SI | SI | SI | COMPLETO |
| CSV | `data.tap.csv` | `data.target.csv` | SI | SI | SI | COMPLETO |
| Excel | `data.tap.excel` | `data.target.excel` | SI | SI | SI | COMPLETO |
| S3 | `data.tap.s3` | `data.target.s3` | SI | SI | SI | COMPLETO |
| SFTP | `data.tap.sftp` | `data.target.sftp` | SI | SI | SI | COMPLETO |
| Salesforce | `data.tap.salesforce` | N/A | SI | SI | SI | COMPLETO (tap-only) |
| REST API | `data.tap.rest_api` | N/A | SI | SI | SI | COMPLETO (tap-only) |
| HubSpot | `data.tap.hubspot` | N/A | SI | SI | SI | COMPLETO (tap-only) |
| Zendesk | `data.tap.zendesk` | N/A | SI | SI | SI | COMPLETO (tap-only) |
| Jira | `data.tap.jira` | N/A | SI | SI | SI | COMPLETO (tap-only) |
| GitHub | `data.tap.github` | N/A | SI | SI | SI | COMPLETO (tap-only) |
| QuickBooks | `data.tap.quickbooks` | N/A | SI | SI | SI | COMPLETO (tap-only) |
| Dynamics 365 | `data.tap.dynamics365` | N/A | SI | SI | SI | COMPLETO (tap-only) |
| BigQuery | N/A | `data.target.bigquery` | SI | SI | SI | COMPLETO (target-only) |

## Cambios Aplicados Para Cerrar Gaps

1. Se registraron explícitamente en engine:
   - `data.tap.db2`
   - `data.target.db2`
2. Se agregó prueba de paridad:
   - `services/engine/tests/test_data_integration_parity.py`
3. Se verificó paridad de sets (`tap` y `target`) entre los 3 planos:
   - Studio = Compiler = Registry.
4. Se agregó guardrail regulatorio en CI:
   - `scripts/regulatory/check-singer-parity.mjs`
   - Integrado en `.github/workflows/regulatory-guardrails.yml`

## Hallazgos Abiertos

- No hay gaps de cobertura en conectores actualmente declarados.
- Tema aparte de cobertura: no existe implementación Singer SDK nativa de catálogo/state; el enfoque sigue siendo nodos Skuld `data.tap.*` / `data.target.*`.

## Guardrails Recomendados (No-Regresión)

1. Mantener el test de paridad en CI para bloquear drift entre Studio/Compiler/Registry.
2. Cada nuevo `data.tap.*` o `data.target.*` debe entrar en un mismo PR con:
   - template Studio
   - branch compiler
   - registro engine
   - test de paridad pasando.
3. Secretos siempre vía Vault/proveedor, nunca hardcoded en plantillas.

## Ejecución De Sprints

### Sprint C1: Cierre de consistencia interna

- Estado: COMPLETADO
- Entregables:
  - Registro DB2 tap/target en engine.
  - Test de paridad (`services/engine/tests/test_data_integration_parity.py`).
  - Guardrail de CI obligatorio (`scripts/regulatory/check-singer-parity.mjs` + workflow).

### Sprint C2: Expansión de conectores

- Estado: EN CURSO (OLA 1 ENTREGADA)
- Alcance:
  - Priorización funcional de nuevos taps/targets.
  - Implementación secuencial con criterio enterprise (template + compiler + registry + tests + guardrails).
- Entrega OLA 1:
  - Nuevos taps SaaS sobre runtime REST validado:
    - `data.tap.hubspot`
    - `data.tap.zendesk`
    - `data.tap.jira`
    - `data.tap.github`
    - `data.tap.quickbooks`
    - `data.tap.dynamics365`
