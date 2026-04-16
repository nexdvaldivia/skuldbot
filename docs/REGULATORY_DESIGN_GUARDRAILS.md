# Regulatory Design Guardrails (Skuld)

Fecha: 2026-02-22  
Estado: obligatorio para todo desarrollo nuevo y cambios relevantes

## 1) Objetivo

Definir un marco `regulated-first` para que Skuld cumpla expectativas de clientes altamente regulados (HIPAA, SOC2 y equivalentes), sin perder utilidad en entornos no regulados.

Principio central:

- mismo producto y mismo core de seguridad/compliance,
- distinta profundidad operativa por perfil de tenant,
- cero bifurcación de código por “producto regulado” vs “producto no regulado”.

## 2) Principios no negociables

- `Secure by default`: seguridad y trazabilidad activas por defecto.
- `Comply by design`: cumplimiento integrado en arquitectura y SDLC, no al final.
- `Least privilege`: permisos mínimos por rol, recurso y contexto.
- `Data minimization`: solo recolectar/procesar lo estrictamente necesario.
- `Tenant isolation`: aislamiento fuerte lógico y operativo.
- `Evidence-first`: toda acción crítica deja evidencia verificable.
- `No plaintext secrets/prompts premium`: secretos e IP protegidos siempre.

## 3) Perfiles operativos (sin bifurcar producto)

Perfiles soportados por política:

- `standard` (no regulado): controles core obligatorios + operación simplificada.
- `regulated` (HIPAA/SOC2-ready): controles reforzados y evidencia completa.
- `strict` (alto riesgo): endurecimiento máximo, retención extendida y validaciones extra.

Regla:

- cualquier capacidad que toque identidad, secretos, datos sensibles, auditoría, licencias o facturación debe funcionar en los 3 perfiles.
- `regulated` es baseline de diseño para nuevas features.

## 4) Guardrails de arquitectura

## 4.1 Separación de planos

- `Control Plane`: gobierno, licencias, metering, telemetría agregada, catálogo, políticas.
- `Orchestrator` por cliente: ejecución, secretos, datos operativos, auditoría local.
- `Runner`: ejecución cercana a sistemas internos del cliente.

Regla explícita:

- el Control Plane no almacena evidencia de ejecución ni auditoría operativa del cliente.
- la integración entre sitio de marketing y Control Plane debe pasar por gateway/API facade; nunca exponer URLs directas de Control Plane en frontend público.

Nunca permitido:

- exfiltrar PHI/PII cruda al Control Plane por defecto,
- guardar secretos o prompts premium en claro en bot DSL, logs o artifacts.

## 4.2 Cloud agnostic obligatorio

- despliegue soportado en `AWS`, `Azure`, `GCP` y `on-prem`.
- empaquetado oficial: `Docker images` firmadas + `docker-compose` (POC) + `Helm` (prod).
- adapters por proveedor para storage/queue/secrets/identity (sin lock-in funcional).
- servicios de negocio deben depender de interfaces/providers, no de SDKs cloud concretos acoplados en capa de aplicación.

## 4.3 Vault y secretos

- BYO Vault obligatorio (`Hashicorp`, `AWS Secrets Manager`, `Azure Key Vault`, `GCP Secret Manager`).
- nunca persistir secreto resuelto fuera del tiempo de ejecución necesario.
- rotación y prueba de conectividad auditables.
- `.env` se limita a desarrollo local con mínimo no sensible; producción consume secretos desde vault/provider y nunca usa defaults inseguros.

## 4.4 Evidence package

- evidence operativo + legal obligatorio en perfil `regulated`, almacenado y gestionado en el Orchestrator del cliente.
- hash canónico, endpoint de verify, cadena de custodia de acceso/descarga.
- almacenamiento inmutable (WORM/object lock) en modo regulado.
- referencia técnica: `docs/NEXION_EVIDENCE_PACKAGE_TRACEABILITY_ASSESSMENT.md`.

## 5) Guardrails de datos y AI agent

## 5.1 Clasificación de datos

Etiquetas mínimas por dataset/flujo/campo:

- `public`, `internal`, `confidential`, `restricted`.
- banderas de sensibilidad: `PII`, `PHI`, `PCI`, `legal_hold`.

Regla:

- sin clasificación explícita no puede ejecutarse en `regulated`.

## 5.2 AI/LLM safety y trazabilidad

- prompts premium por `promptRef` (no texto plano en bot).
- registrar metadata de inferencia permitida (modelo, versión, policy, input/output schema).
- masking/redacción antes de log/telemetría.
- policy checks previos y posteriores a inferencia.

## 5.3 Flujo universal RPA + Agent + Data movement

Todo bot debe poder:

- automatizar UI/API/archivos,
- razonar con agente,
- mover datos fuente->destino con quality gates y contracts.

Control obligatorio:

- validación de esquema de entrada/salida,
- quality gates configurables (rechazo/cuarentena/reintento),
- lineage técnico y lineage de decisión del agente.

## 6) Guardrails de desarrollo (SDLC)

## 6.1 Requisitos antes de construir

- ADR corto por feature (decisión, riesgos, impacto compliance).
- threat model mínimo para cambios en auth/secrets/data/AI.
- clasificación de datos y perfil de control objetivo (`standard|regulated|strict`).
- revisión Nexion-first: documentar qué módulos de Nexion se reutilizan/adaptan y por qué.

## 6.2 Estándar UI enterprise (cuando aplique)
- aplicar principios de Refactoring UI en diseño y composición.
- respetar tokens/colores corporativos Skuld y tipografía `Montserrat`.
- usar componentes `shadcn/ui` para UI de producto (evitar componentes nativos/sistema en flujos core).
- usar toasts para feedback de usuario; prohibido `alert/confirm/prompt` nativos.

## 6.3 Requisitos para merge
- tests unitarios/integración de controles críticos.
- pruebas de autorización negativa (denegar cuando corresponde).
- pruebas de no filtrado de secretos/PHI/PII en logs.
- evidencia de migraciones seguras (backward compatible o plan de migración).

## 6.4 Requisitos para release
- checklist de seguridad/compliance aprobado.
- evidencia de observabilidad activa (logs, métricas, trazas, alertas).
- runbook de rollback/incidente actualizado.
- para `regulated`: evidencia exportable para auditoría.

## 7) Guardrails de operación

- mTLS + JWT firmado en CP <-> Orchestrator.
- auditoría inmutable de acciones privilegiadas.
- JIT access para soporte, con expiración y motivo obligatorio.
- retención de logs/evidencia por política de tenant.
- monitoreo de integridad y alertas de tampering.

## 8) RBAC/ABAC mínimo obligatorio

Roles base:

- `security_admin`, `compliance_officer`, `platform_ops`, `tenant_admin`, `bot_developer`, `auditor_readonly`.

Reglas:

- separación de funciones (SoD): quien desarrolla no aprueba políticas críticas solo.
- acciones de alto riesgo requieren step-up auth.
- `auditor_readonly` sin permisos de mutación.

## 9) Prompt/IP y comercial

- prompts premium no visibles al cliente final.
- clientes pueden crear prompts propios (`BYOPrompt`) bajo su control.
- se permite monetización de catálogo de prompts con entitlements y metering.
- nunca mezclar secreto del cliente con prompt premium persistido en claro.

## 10) Definition of Done regulatoria (DoD-R)

Una feature se considera terminada solo si cumple:

- controles de acceso correctos,
- secretos y datos sensibles protegidos,
- trazabilidad/evidencia implementada y verificable,
- observabilidad y alertas mínimas activas,
- documentación operativa y de cumplimiento actualizada.

## 11) Proceso de excepciones

Si un guardrail no se puede cumplir temporalmente:

- crear excepción formal con alcance, riesgo, mitigación y fecha límite.
- aprobación requerida de `security_admin` + `compliance_officer`.
- seguimiento en backlog con prioridad alta y vencimiento explícito.

Regla dura:

- no hay excepciones indefinidas en producción regulada.

## 12) KPI de adopción del marco

- `% features nuevas con ADR + threat model`.
- `% flujos con clasificación de datos completa`.
- `% runs con evidence pack verificable`.
- `MTTR` de hallazgos de seguridad/compliance.
- `% endpoints críticos con pruebas de autorización negativa`.

## 13) Enforcement automatizado (CI)

- Template de PR obligatorio:
  - `.github/pull_request_template.md`
- Validación automática de guardrails en PR:
  - `.github/workflows/regulatory-guardrails.yml`
- Controles de ejecución diaria del equipo/agente:
  - `docs/AGENT_WORK_CONTROLS_POLICY.md`
  - `scripts/regulatory/check-work-controls.mjs`
- Criterio:
  - si falta perfil regulatorio, checklist obligatorio o declaración de riesgo/excepción, el workflow falla.

## 14) Enlaces de referencia

- Plan maestro: `docs/ENTERPRISE_RPA_AI_AGENT_MASTER_PLAN.md`
- Evidence package: `docs/NEXION_EVIDENCE_PACKAGE_TRACEABILITY_ASSESSMENT.md`
- Adaptación Nexion/Nexion-One: `docs/NEXION_FULL_SCAN_ADAPTATION_BLUEPRINT.md`
- Controles operativos del trabajo: `docs/AGENT_WORK_CONTROLS_POLICY.md`
