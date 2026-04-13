# Docs Governance: Nodes and Platform

Fecha: 2026-02-22  
Estado: obligatorio

## 1) Objetivo

Garantizar que la documentación de nodos y de plataforma evolucione en paralelo al código.

Regla principal:

- no se acepta cambio funcional en nodo/contrato/componente sin actualización documental en el mismo PR.

## 2) Source of Truth documental

- Catálogo y comportamiento de nodos:
  - `engine/skuldbot/nodes/registry.py`
  - `studio/src/data/nodeTemplates.ts`
- Contratos API:
  - control plane: `control-plane/api`
  - orchestrator: `orchestrator/api`
- Arquitectura y operación:
  - `docs/PLATFORM_EXECUTION_MAP.md`
  - `docs/ENTERPRISE_RPA_AI_AGENT_MASTER_PLAN.md`
  - `docs/REGULATORY_DESIGN_GUARDRAILS.md`

## 3) Mínimo documental por nodo

Cada nodo nuevo o modificado debe dejar documentado:

- `node_type` y categoría.
- objetivo funcional.
- esquema de entrada/salida (incluyendo campos obligatorios).
- manejo de secretos (si aplica).
- clasificación de datos esperada (`none|PII|PHI|PCI|restricted`).
- comportamiento en error/retry/timeout.
- ejemplos de uso válidos.
- consideraciones regulatorias y de auditoría.

## 4) Mínimo documental por cambio de plataforma

Si se toca CP/Orchestrator/Runner/Studio/Deployers:

- contrato afectado (endpoint/evento/payload).
- impacto en seguridad/compliance.
- impacto en observabilidad/evidence.
- guía de operación o migración (si cambia comportamiento).

## 5) Regla de sincronización en PR

Todo PR debe declarar explícitamente una de estas dos opciones:

- `Docs updated`: sí hubo actualización documental en este PR.
- `Docs N/A`: no aplica, con breve justificación.

Sin esta declaración, el PR no cumple guardrails.

## 6) Ubicación recomendada de actualizaciones

- Nodos y DSL: `docs/ENGINE_REFERENCE.md`, `docs/DATA_INTEGRATION.md`, `docs/TRIGGERS.md`.
- Arquitectura/flujo entre componentes: `docs/PLATFORM_EXECUTION_MAP.md`.
- Seguridad/compliance: `docs/REGULATORY_DESIGN_GUARDRAILS.md`.
- Operación/deploy: `docs/DEPLOYMENT_GUIDE.md`, `docs/INSTALLATION.md`.

## 7) Criterio de aceptación documental

Una actualización documental es válida si:

- describe el cambio real (no texto genérico),
- permite a otro equipo usar/operar la capacidad sin leer todo el código,
- incluye restricciones de seguridad/compliance cuando aplica.
