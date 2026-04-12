# Deep Scan Nexion (PaaS) + Nexion-One (Control Plane)

Fecha: 2026-02-22  
Estado: escaneo técnico completo (estructura, APIs, servicios, seguridad, contratos y operación)

## 1) Alcance escaneado

- `nexion` (PaaS/data platform): `/Users/dubielvaldivia/Documents/khipus/nexion/nexion`
- `nexion-one` (control plane): `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one`
- contratos compartidos: `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/contracts`

Regla aplicada:

- solo lectura en repos externos;
- sin cambios en `nexion` ni `nexion-one`.

## 2) Métricas de inventario

Tamaño:

- `nexion`: `3.3G`
- `nexion-one`: `5.2G`

Backend Python (app):

- `nexion/backend/app`: `390` archivos `.py`
- `nexion-one/backend/app`: `327` archivos `.py`

API:

- `nexion/backend/app/api`: `66` archivos `.py`
- `nexion-one/backend/app/api`: `106` archivos `.py`
- decoradores de rutas detectados:
  - `nexion`: `948`
  - `nexion-one`: `1118`

Modelos:

- `nexion/backend/app/models`: `55`
- `nexion-one/backend/app/models`: `79`

Servicios:

- `nexion/backend/app/services`: `150`
- `nexion-one/backend/app/services`: `63`

Módulos admin/public (CP):

- `nexion-one/api/v1/admin`: `46` archivos
- `nexion-one/api/v1/public`: `18` archivos
- `nexion-one/api/v1/webhooks`: `2` archivos
- `nexion-one/api/v1/ws`: `2` archivos

Migraciones Alembic:

- `nexion`: `88`
- `nexion-one`: `206`

Tests:

- `nexion/backend/tests`: `300` archivos
- `nexion-one/backend/tests`: `54` archivos

Frontend (Next.js, páginas):

- `nexion/frontend`: `104` `page.tsx`
- `nexion-one/frontend`: `81` `page.tsx`

## 3) Nexion (PaaS) - mapa funcional real

`nexion` es claramente el data/runtime plane:

- ingesta y conectividad: `sources`, `connectors`, `connector_repository`, `storage_destinations`, `credentials`
- ejecución: `pipelines`, `runs`, `schedules`, `data_ops`, `transforms`
- gobierno/calidad: `governance`, `quality`, `catalog`, `glossary`, `ownership`, `certifications`
- cumplimiento y protección: `compliance`, `audit`, `profiling`, `pii/phi` tooling
- trazabilidad: `lineage`, `openlineage_service`, observabilidad
- capacidades analíticas: `analytics`, `semantic_layer`, `whatif`
- verticalización e infraestructura: `verticals`, `vertical_infrastructure`, `data_gateway`

Evidencia y auditoría técnica en PaaS:

- Evidence pack runtime por transform run:
  - `backend/app/services/transform_evidence_service.py`
  - `backend/app/api/v1/transforms.py` (`/runs/{run_id}/evidence*`)
- Pack de auditoría/compliance:
  - `backend/app/services/audit_service.py`

## 4) Nexion-One (Control Plane) - mapa funcional real

`nexion-one` opera como control plane enterprise central:

- gobierno comercial y clientes: `clients`, `subscriptions`, `pricing`, `invoices`, `billing`, `payments`
- licenciamiento y cuotas: `licenses`, `ip_licenses`, `quota`, `usage`, `telemetry`
- operación de despliegues/instalaciones:
  - `installations.py` (validación, heartbeat, usage, contratos, verificación instalador OTP)
  - `deployments.py` (credenciales, plan/apply/cancel/logs)
- backoffice enterprise (muy amplio):
  - CRM/ventas: `admin/leads.py`, `admin/sales.py`
  - soporte completo: `admin/support.py`, `support.py`, `ticket_service.py`, `sla_service.py`, `support_config_service.py`
  - marketing/email: `admin/marketing_*`, `admin/email_accounts.py`, `webhooks/email.py`
  - seguridad/tenant isolation: `admin/security.py`, `admin/tenant_isolation.py`
  - command center y analítica: `command_center.py`, `analytics.py`, `reports.py`
- módulo website/public:
  - `public/*` para leads, appointments, tracking, unsubscribe, events, sign

## 5) Contrato PaaS <-> CP detectado en código

Existe contrato formal y cliente compartido:

- contratos Python:
  - `contracts/python/nexion_contracts/{license,telemetry,connector,client}.py`
- OpenAPI y versionado:
  - `contracts/openapi/nexionmind-api.yaml`
  - `contracts/docs/versioning.md`

Flujos operativos observados:

- licencia: validación y cache en PaaS vía CP (`nexionone_sync_service.py`)
- catálogo: sync de conectores permitidos por tier
- telemetría/uso: eventos + batch + heartbeat
- cuotas: `quota/check` + `record_usage` por recurso
- instalación/deployer: token de instalación + heartbeat + estatus + verificación instalador

## 6) Seguridad/compliance observada

En ambos repos:

- FastAPI + SQLAlchemy async + Alembic + RBAC
- MFA, JWT, controles de rol jerárquico y granular

Nexion (PaaS):

- secretos cloud-native multi-proveedor:
  - `platform_secrets_service.py` (Azure Key Vault, AWS Secrets Manager, etc.)
- enfoque fuerte en protección de datos y evidencia técnica

Nexion-One (CP):

- `secrets_service.py` con énfasis Azure Key Vault en producción
- `tenant_isolation` administrativo explícito
- controles anti-abuso y canales públicos (recaptcha, webhooks firmados, preferencias/unsubscribe)

## 7) Procesos enterprise particularmente maduros en Nexion-One

CRM/ventas:

- pipeline y lifecycle de lead: assign/contact/convert/lost/approve/reject/move + actividades

Soporte:

- creación/listado/estado/comentarios/adjuntos/asignación/auto-asignación/merge/CSAT
- reglas de transición y SLA por política

Comercial/marketing:

- campañas, audiencias/listas, templates, cuentas de envío, tracking y supresión

Instalación enterprise:

- flujo largo de instalaciones con contratos y verificación del instalador

## 8) Diferencia estructural clave (para Skuld)

- `nexion` = plano de datos/ejecución (PaaS por cliente)
- `nexion-one` = plano central de gobierno/comercial (CP)

Esto está alineado con la dirección de Skuld:

- `Orchestrator` por cliente como execution plane
- `Control Plane` central para gobierno/licencias/telemetría/comercial

## 9) Reutilización recomendada en Skuld (adaptar, no copiar 1:1)

Traer desde `nexion-one`:

- dominio CRM/ventas/soporte/marketing
- contratos de instalación/fleet/heartbeat/usage/quota/licencias
- patrón `integrations` provider-first (`integration_definitions` + configs por organización)
- command center y alerting operativo

Traer desde `nexion`:

- patrón de evidence runtime verificable por hash
- trazabilidad técnica de runs + lineage + quality/compliance gates
- enfoque data-movement universal y ejecución robusta

## 10) Riesgos de adopción (si se migra sin adaptación)

- copiar HTTP layer FastAPI literal en lugar de portar dominio a NestJS en Skuld
- mezclar identidad visual/UX de Nexion con Skuld
- acoplar CP a evidencia operativa cuando en Skuld la auditoría runtime debe quedar en Orchestrator del cliente
- no separar claramente APIs públicas de marketing vs APIs administrativas core

## 11) Conclusión ejecutiva

- Sí, el escaneo confirma que `nexion-one` ya tiene un CP enterprise muy avanzado (CRM + soporte + marketing + integraciones + operación de instalaciones + seguridad).
- Sí, `nexion` ya contiene gran parte del músculo de ejecución, calidad, compliance y evidencia técnica reutilizable para un Orchestrator enterprise.
- La combinación de ambos, con adaptación de dominio y contratos (sin clonado visual/código 1:1), acelera de forma fuerte la hoja de ruta de Skuld.
