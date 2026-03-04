# Nexion + Nexion-One Full Scan and Adaptation Blueprint (for Skuldbot)

Fecha de escaneo: 2026-02-22

## 1) Objetivo
Escanear integralmente `nexion` y `nexion-one` para definir qué capacidades conviene adaptar en Skuldbot con enfoque enterprise:
- `nexion`: plataforma de datos (data plane).
- `nexion-one`: control plane enterprise.

Reglas aplicadas:
- No modificar código fuente de Nexion/Nexion-One.
- Reusar dominio y patrones, no copiar capa HTTP 1:1.
- Adaptar UX/UI a identidad Skuld (logo, paleta, componentes y navegación propios).
- `skuldbotweb` es continuidad oficial de marketing web en Skuld: no se clona ni se sustituye con `nexion-website`.

## 2) Repositorios y tamaño observado
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion` ~ `3.3G`
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one` ~ `5.2G`

Inventario rápido backend:
- `nexion/backend`: `670` archivos Python.
- `nexion-one/backend`: `631` archivos Python.
- APIs:
- `nexion/app/api`: `66` archivos.
- `nexion-one/app/api`: `106` archivos.
- Modelos:
- `nexion/app/models`: `55`.
- `nexion-one/app/models`: `79`.
- Servicios:
- `nexion/app/services`: `150`.
- `nexion-one/app/services`: `63`.

## 3) Qué es cada plataforma (con evidencia del código)
`nexion` (Data Platform):
- Router y dominios orientados a datos: `sources`, `data_pods`, `pipelines`, `quality`, `lineage`, `governance`, `semantic_layer`, `data_gateway`, `transforms`, `cdc`.
- `platform_core` con motores de protección/PII/PHI, conectores, ejecución y schemas verticales.
- Servicios fuertes de data engineering y gobierno: `data_contract_service`, `lineage_service`, `quality_*`, `compliance/*`, `transform_*`, `sync/*`, `connector_*`.

`nexion-one` (Control Plane):
- Router con foco en gestión central: `licenses`, `ip_licenses`, `telemetry`, `usage`, `billing`, `subscriptions`, `clients`, `packages`, `deployments`, `quota`, `command_center`.
- Dominio comercial y de operación enterprise: `sales`, `leads`, `marketing_*`, `email_accounts`, `support`, `contracts/signing`, `webhooks`.
- Servicios de CP: `license_signing_service`, `telemetry_service`, `billing_service`, `quota_service`, `secrets_service`, `security_service`.
- Patrón de integraciones por proveedor: `payment_provider`, `payment_provider_factory`, `multi_email_service`, `storage_service`, `integrations.py`.

## 4) Capacidades detectadas por bloque
## 4.1 Bloque Data Platform (`nexion`) útil para Skuld
- Ingesta y conectividad:
- `connectors`, `sources`, `connector_repository`, `local_connectors`, `data/connectors`.
- Pipelines y ejecución:
- `pipelines`, `runs`, `schedules`, `execution/topology`.
- Calidad y cumplimiento:
- `quality`, `compliance`, `protection`, `phi/detector`, masking engines.
- Gobierno de datos:
- `catalog`, `glossary`, `ownership`, `governance`, `certifications`.
- Linaje y observabilidad:
- `lineage`, `openlineage_service`, `observability`, run metrics.
- Semántica y analytics:
- `semantic_layer`, `whatif`, `analytics`, `prism/*`.
- Verticalización:
- `verticals`, `vertical_infrastructure`, `vertical_*`.

## 4.2 Bloque Control Plane (`nexion-one`) útil para Skuld
- Licenciamiento y monetización:
- `licenses`, `ip_licenses`, `subscriptions`, `billing`, `invoices`, `payments`, `pricing`.
- Telemetría y cuota:
- `telemetry`, `usage`, `quota`, `gateway_telemetry`.
- Operación de clientes:
- `clients`, `client_contacts`, `client_addresses`, `deployments`, `installations`.
- Seguridad enterprise:
- `security`, `tenant_isolation`, `mfa`, `roles`, `secrets_service`.
- Contratos y firma:
- `contracts`, `contract_renewals`, `signing`, `signatories`, `public/sign`.
- Growth/Revenue ops:
- `sales`, `leads`, `marketing_campaigns`, `marketing_lists`, `marketing_templates`, `email_accounts`, `webhooks/email`.
- Command center y reporting:
- `command_center`, `reports`, `alerts`.

## 4.3 Ecosistema adicional escaneado
- `nexion-deployer`: app Tauri para despliegue guiado cloud.
- `nexion-deployer-aws`: variante deployer para AWS.
- `nexion-prism`: vertical BI/analytics (dashboards, reporting, ask-data).
- `nexion-vertical-sdk`: SDK Python para verticales con gateway controlado.
- `nexion-website`: sitio marketing y assets de contenido.
- `nexion-one/contracts`: snapshot OpenAPI + SDK Python de contratos.

## 5) Qué traer a Skuldbot (adaptación recomendada)
## 5.1 Prioridad P0 (base enterprise inmediata)
- De `nexion-one` a `control-plane` de Skuld:
- licencias + ip licensing + usage + telemetry + quota + billing core.
- secretos/seguridad/tenant isolation (patrones de `secrets_service` y `security_service`).
- contratos de comunicación CP<->orchestrator y heartbeat/fleet.
- De `nexion` a `orchestrator/engine` de Skuld:
- patrones de protección PII/PHI y cumplimiento runtime.
- patrones de calidad/lineage/gobernanza para runs y evidencia.

## 5.2 Prioridad P1 (alto impacto comercial)
- De `nexion-one`:
- CRM/ventas (`leads`, `sales`, `lead_activity`).
- marketing (`campaigns`, `lists`, `templates`, `email_accounts`, webhooks de deliverability).
- command center/reportes operativos por tenant.
- De `nexion`:
- módulos data-centric para flujos universales: `data_contract`, `quality`, `semantic_layer`, `data_gateway`.

## 5.3 Prioridad P2 (escala y ecosistema)
- Deployer patterns (nexion-deployer) para onboarding enterprise.
- Prism patterns para BI avanzado embebido.
- Vertical SDK/patrones de verticalización y exposición controlada.

## 6) Mapa de adaptación a Skuldbot (target)
`control-plane/api`:
- `licenses`, `billing`, `usage`, `telemetry`, `quota`, `clients`, `security`, `tenant-isolation`, `contracts`, `crm`, `marketing`, `email-accounts`.
- `integrations` provider-first:
- `service_type` + `provider` + `config_schema` + `capabilities` + `health`.
- adapters desacoplados para `payment`, `storage`, `email`, `identity`, `webhooks`.

`control-plane/ui`:
- dashboard operativo tipo command-center.
- módulos CRM/Marketing/Contracts/Clients/Usage/Billing.
- diseño propio Skuld (sin clonar UI Nexion).

`orchestrator/api`:
- fleet registration/heartbeat/health.
- enforcement de políticas, entitlements y secretos.
- runtime resolver para prompts premium + vault mapping.
- cloud-agnostic runtime:
- adapters de infraestructura por proveedor (storage/queue/secrets/identity).
- sin lock-in funcional a Azure, AWS o GCP.
- soporte de despliegue en Kubernetes estándar multi-cloud.
- soporte de instalación explícita: `AWS`, `Azure`, `GCP` y `on-premise`.
- soporte de despliegue containerizado con Docker (compose para POC, Helm/K8s para prod).

`engine` y `runner`:
- ejecución universal (RPA + agent + data movement).
- calidad, cumplimiento, redacción PII/PHI y trazabilidad de evidencia.

## 7) Módulos NO recomendados para copia directa
- Capa HTTP FastAPI completa (reimplementar en NestJS).
- Frontend completo de Nexion/Nexion-One (usar solo referencia funcional).
- Contenido de marketing website tal cual (solo estructura/comercial insights).
- Artefactos de build, `node_modules`, `.next`, binarios y carpetas temporales.

## 8) Riesgos y mitigación
- Riesgo: scope creep por intentar migrar todo.
- Mitigación: ejecución por olas P0/P1/P2 con criterios de salida.
- Riesgo: mezclar responsabilidades CP y Data Plane.
- Mitigación: límite duro CP (gobierno/comercial) vs Orchestrator/Engine (ejecución).
- Riesgo: fuga de secretos o IP.
- Mitigación: vault obligatorio, masking estricto, promptRef, auditoría inmutable.
- Riesgo: drift visual por copiar UIs.
- Mitigación: design tokens Skuld + QA visual + aceptación de branding.

## 9) Plan de ejecución propuesto (resumen)
Semana 1-2:
- cerrar P0 de seguridad/comunicación/fleet/licensing/usage.

Semana 3-5:
- CRM + marketing + email accounts + webhooks + metering comercial.

Semana 6-8:
- hardening compliance SOC2/HIPAA + observabilidad + evidencia + runbooks.

Semana 9+:
- vertical packs, BI avanzado, optimización FinOps y ecosistema partner.

## 10) Decisión arquitectónica final
- `nexion-one` es referencia principal para el Control Plane de Skuld.
- `nexion` es referencia principal para capacidades de Data Platform y ejecución data-intensive.
- Skuldbot debe converger en una arquitectura dual:
- Control Plane enterprise central.
- Orchestrator/Runner por cliente con ejecución segura y autónoma.
- El Control Plane de Skuld debe adoptar diseño `provider-first` de integraciones para evitar lock-in y facilitar cumplimiento enterprise.
- El Orchestrator de Skuld debe ser cloud-agnostic por contrato técnico y operativo.
- Matriz mínima de instalación enterprise: AWS + Azure + GCP + on-premise.
