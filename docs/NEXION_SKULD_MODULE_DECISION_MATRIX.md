# Nexion -> Skuld Module Decision Matrix (Detailed)

Fecha: 2026-02-23  
Estado: matriz modulo por modulo para adaptacion

## 1) Leyenda de decision
- `APLICA_P0`: aplicar ahora (base enterprise)
- `APLICA_P1`: aplicar en siguiente ola
- `APLICA_P2`: aplicar luego (opcional/escala)
- `NO_REUSAR_DESDE_NEXION`: no se reutiliza desde modulo `nexion`; si aplica en producto, se implementa directo en Skuld.
- en la tabla `Nexion -> Skuld`, `NO_REUSAR_DESDE_NEXION` significa que no se toma ese modulo como fuente de reutilizacion.

Regla dura ya definida:
- auditoria y evidencia operativa de ejecucion viven en `Orchestrator` por cliente.
- `Control Plane` no almacena evidence packs ni trails operativos de runs.
- toda capacidad marcada desde `nexion-one` se implementa en `SkuldOne` (CP de Skuld); `nexion-one` es solo referencia funcional.

## 2) Nexion (PaaS) -> Skuld

| Modulo Nexion | Decision | Destino Skuld | Nota |
|---|---|---|---|
| `auth` | APLICA_P2 | `orchestrator/ui`, `orchestrator/api` | Patrones de auth local, no copiar API 1:1 |
| `sources` | APLICA_P0 | `orchestrator/api`, `studio` | Base de ingesta fuente |
| `data_pods` | APLICA_P1 | `orchestrator/api`, `studio` | Modelo de activos de datos por tenant |
| `pipelines` | APLICA_P0 | `orchestrator/api`, `engine`, `studio` | Core de ejecucion de flujos |
| `runs` | APLICA_P0 | `orchestrator/api`, `runner` | Runtime y tracking de ejecucion |
| `schedules` | APLICA_P0 | `orchestrator/api` | Scheduling enterprise |
| `catalog` | APLICA_P1 | `orchestrator/api`, `docs-components` | Catalogacion de activos/nodos |
| `lineage` | APLICA_P1 | `orchestrator/api` | Trazabilidad tecnica |
| `connector_repository` | APLICA_P1 | `control-plane/api`, `orchestrator/api` | Catalogo y governance de conectores |
| `licenses` | NO_REUSAR_DESDE_NEXION | `control-plane/api` | Licencias gestionadas en `SkuldOne` (referencia funcional: `nexion-one`) |
| `connectors` | APLICA_P0 | `orchestrator/api`, `engine` | Conectividad universal |
| `schema_discovery` | APLICA_P1 | `orchestrator/api`, `studio` | Descubrimiento de esquema |
| `gateways` | APLICA_P1 | `orchestrator/api`, `runner`, `deployers` | Conectividad hybrid/on-prem |
| `mfa` | APLICA_P2 | `control-plane/api`, `orchestrator/ui` | Reusar patron de seguridad |
| `profile` | APLICA_P2 | `control-plane/ui`, `orchestrator/ui` | Perfil de usuario |
| `storage_destinations` | APLICA_P0 | `orchestrator/api` | Data movement destino |
| `credentials` | APLICA_P0 | `orchestrator/api` | Credenciales y vault mapping |
| `billing` | NO_REUSAR_DESDE_NEXION | `control-plane/api` | Billing core en `SkuldOne` (patrones tomados de `nexion-one`) |
| `billing_portal` | NO_REUSAR_DESDE_NEXION | `control-plane/ui` | Portal de billing CP |
| `governance` | APLICA_P1 | `orchestrator/api` | Politicas y gobierno runtime |
| `quality` | APLICA_P1 | `orchestrator/api`, `engine` | Quality gates en ejecucion |
| `data_gateway` | APLICA_P1 | `orchestrator/api` | Abstraccion de acceso a datos |
| `verticals` | APLICA_P2 | `control-plane/api`, `orchestrator/api` | Paquetes verticales opcionales |
| `vertical_infrastructure` | APLICA_P2 | `deployers` | Provisioning por vertical |
| `setup` | NO_REUSAR_DESDE_NEXION | `deployers` | Onboarding propio de Skuld |
| `support` | NO_REUSAR_DESDE_NEXION | `control-plane/api` | Soporte en `SkuldOne` (dominio adaptado desde `nexion-one`) |
| `profiling` | APLICA_P2 | `orchestrator/api` | Perfilado de datos avanzado |
| `glossary` | APLICA_P2 | `docs-components`, `orchestrator/api` | Gobierno semantico opcional |
| `data_products` | APLICA_P2 | `control-plane/api` | Producto de datos no core inicial |
| `ownership` | APLICA_P2 | `control-plane/api` | Ownership enterprise opcional |
| `search` | APLICA_P2 | `control-plane/api`, `orchestrator/ui` | Busqueda transversal |
| `usage` | NO_REUSAR_DESDE_NEXION | `control-plane/api` | Usage central en `SkuldOne` (contratos inspirados en `nexion-one`) |
| `collaboration` | APLICA_P2 | `studio`, `control-plane/ui` | Colaboracion avanzada |
| `nexionmind` | NO_REUSAR_DESDE_NEXION | - | Modulo acoplado a marca Nexion |
| `assets` | APLICA_P2 | `control-plane/ui`, `docs-components` | Gestion de assets opcional |
| `notifications` | APLICA_P1 | `control-plane/api`, `orchestrator/ui` | Notificaciones operativas |
| `contracts` | APLICA_P1 | `control-plane/api` | Contratos enterprise |
| `observability` | APLICA_P1 | `orchestrator/api`, `control-plane/api` | Observabilidad por planos |
| `data_ops` | APLICA_P1 | `orchestrator/api` | Operacion data-intensive |
| `enterprise` | APLICA_P2 | `control-plane/api` | Politicas enterprise varias |
| `cdc` | APLICA_P2 | `orchestrator/api` | CDC avanzado |
| `analytics` | APLICA_P2 | `control-plane/ui` | BI de plataforma |
| `marketplace` | NO_REUSAR_DESDE_NEXION | `control-plane/api` | Marketplace base en CP Skuld |
| `whatif` | APLICA_P2 | `control-plane/ui` | Analisis de escenarios opcional |
| `semantic_layer` | APLICA_P2 | `orchestrator/api`, `control-plane/api` | Semantica avanzada |
| `signed_documents` | APLICA_P1 | `control-plane/api` | Evidencia legal/contractual |
| `system` | APLICA_P2 | `control-plane/api`, `orchestrator/api` | Estado/versiones |
| `compliance` | APLICA_P0 | `orchestrator/api`, `engine` | Compliance runtime |
| `catalog_registry` | APLICA_P2 | `control-plane/api` | Registro global opcional |
| `certifications` | APLICA_P2 | `control-plane/api` | Certificaciones enterprise |
| `transforms` | APLICA_P0 | `engine`, `orchestrator/api` | Motor de transformacion |
| `dashboard` | APLICA_P2 | `control-plane/ui`, `orchestrator/ui` | Dashboards operativos |
| `compute_settings` | APLICA_P2 | `orchestrator/api`, `deployers` | Config de compute |
| `audit` | APLICA_P0 | `orchestrator/api` | Solo auditoria local cliente |
| `integrations` | APLICA_P0 | `control-plane/api` | Fabric provider-first |
| `admin.users` | APLICA_P1 | `orchestrator/api`, `control-plane/api` | Gestion de usuarios |
| `admin.roles` | APLICA_P1 | `orchestrator/api`, `control-plane/api` | RBAC |
| `admin.organizations` | NO_REUSAR_DESDE_NEXION | `control-plane/api` | Modelo org cambia a tenant CP |
| `admin.security` | APLICA_P0 | `control-plane/api`, `orchestrator/api` | Guardrails de seguridad |

## 3) Nexion-One (CP) Core API -> Skuld

| Modulo Nexion-One | Decision | Destino Skuld | Nota |
|---|---|---|---|
| `auth` | APLICA_P0 | `control-plane/api` | Base de acceso CP |
| `clients` | APLICA_P0 | `control-plane/api` | Tenant/customer master |
| `licenses` | APLICA_P0 | `control-plane/api` | Licenciamiento central |
| `connectors` | APLICA_P1 | `control-plane/api` | Governance de catalogo |
| `telemetry` | APLICA_P0 | `control-plane/api` | Ingest de telemetria agregada |
| `packages` | APLICA_P1 | `control-plane/api` | Bot packages/catalogo |
| `me` | APLICA_P1 | `control-plane/api`, `control-plane/ui` | Self-service tenant |
| `verticals` | APLICA_P2 | `control-plane/api` | Oferta por vertical |
| `profile` | APLICA_P1 | `control-plane/ui` | Perfil |
| `ip_licenses` | APLICA_P0 | `control-plane/api` | Licencia de IP (bots/prompts) |
| `usage` | APLICA_P0 | `control-plane/api` | Usage y metering |
| `pricing` | APLICA_P0 | `control-plane/api` | Pricing plans |
| `subscriptions` | APLICA_P0 | `control-plane/api` | Suscripciones |
| `invoices` | APLICA_P0 | `control-plane/api` | Facturacion |
| `billing` | APLICA_P0 | `control-plane/api` | Billing core |
| `contracts` | APLICA_P1 | `control-plane/api` | Contratos legales |
| `payments` | APLICA_P0 | `control-plane/api` | Pagos provider-first |
| `contract_renewals` | APLICA_P1 | `control-plane/api` | Renovaciones |
| `billing_portal` | APLICA_P1 | `control-plane/ui` | Portal financiero |
| `integrations` | APLICA_P0 | `control-plane/api` | Registry de proveedores |
| `checkout` | APLICA_P1 | `control-plane/api`, `skuldbotweb/backend` | Self-serve comercial |
| `installations` | APLICA_P0 | `control-plane/api`, `deployers` | Fleet/install flow |
| `mfa` | APLICA_P0 | `control-plane/api` | MFA CP |
| `deployments` | APLICA_P1 | `deployers`, `control-plane/api` | Plan/apply/cancel |
| `analytics` | APLICA_P2 | `control-plane/ui` | Analitica ejecutiva |
| `command_center` | APLICA_P1 | `control-plane/ui` | Vista 360 CP |
| `quota` | APLICA_P0 | `control-plane/api` | Enforcement de cuotas |
| `settings` | APLICA_P1 | `control-plane/api` | Configuracion global |
| `support` | APLICA_P1 | `control-plane/api`, `control-plane/ui` | API de soporte cliente |
| `reports` | APLICA_P1 | `control-plane/api`, `control-plane/ui` | Reporteria |
| `client_addresses` | APLICA_P1 | `control-plane/api` | Datos administrativos |
| `client_contacts` | APLICA_P1 | `control-plane/api` | Contactos enterprise |
| `nexionmind` | NO_REUSAR_DESDE_NEXION | - | Renombrar a dominio Skuld |
| `signed_documents` | APLICA_P1 | `control-plane/api` | Evidencia legal |

## 4) Nexion-One Admin API -> Skuld

| Modulo Admin | Decision | Destino Skuld | Nota |
|---|---|---|---|
| `connectors` | APLICA_P1 | `control-plane/api` | Admin catalogo conectores |
| `jobs` | APLICA_P2 | `control-plane/api` | Jobs internos CP |
| `billing` | APLICA_P0 | `control-plane/api` | Admin billing |
| `users` | APLICA_P0 | `control-plane/api` | Admin usuarios |
| `roles` | APLICA_P0 | `control-plane/api` | RBAC |
| `leads` | APLICA_P0 | `control-plane/api` | CRM leads |
| `sales` | APLICA_P0 | `control-plane/api` | Pipeline ventas |
| `support` | APLICA_P1 | `control-plane/api` | Tickets/SLA |
| `support_config` | APLICA_P1 | `control-plane/api` | Reglas SLA/asignacion |
| `email_accounts` | APLICA_P0 | `control-plane/api` | Cuentas de envio |
| `partners` | APLICA_P2 | `skuldbotweb/backend` | Solo si CMS web central |
| `partner_types` | APLICA_P2 | `skuldbotweb/backend` | Solo si CMS web central |
| `faqs` | APLICA_P2 | `skuldbotweb/backend` | Solo si CMS web central |
| `careers` | NO_REUSAR_DESDE_NEXION | - | Fuera del core producto |
| `social_links` | APLICA_P2 | `skuldbotweb/backend` | CMS web opcional |
| `applications` | NO_REUSAR_DESDE_NEXION | - | HR/careers no prioritario |
| `case_studies` | APLICA_P2 | `skuldbotweb/backend` | Contenido marketing |
| `blog` | APLICA_P2 | `skuldbotweb/backend` | Contenido marketing |
| `blog_authors` | APLICA_P2 | `skuldbotweb/backend` | Contenido marketing |
| `media` | APLICA_P2 | `skuldbotweb/backend` | Libreria media |
| `system_settings` | APLICA_P1 | `control-plane/api` | Config global |
| `nexionmind` | NO_REUSAR_DESDE_NEXION | - | Modulo de marca Nexion |
| `addons` | APLICA_P1 | `control-plane/api` | Add-ons comerciales |
| `scheduling` | APLICA_P1 | `control-plane/api` | Scheduling comercial/ops |
| `enterprise_docs` | APLICA_P2 | `docs-components` | Docs enterprise |
| `reports` | APLICA_P1 | `control-plane/api` | Reportes admin |
| `nexionmind_limits` | APLICA_P2 | `control-plane/api` | Limites planes IA |
| `nexionmind_plans` | APLICA_P2 | `control-plane/api` | Planes IA/prompts |
| `security` | APLICA_P0 | `control-plane/api` | Security admin |
| `marketing_lists` | APLICA_P0 | `control-plane/api` | Audiencias/listas |
| `marketing_campaigns` | APLICA_P0 | `control-plane/api` | Campanas |
| `marketing_templates` | APLICA_P0 | `control-plane/api` | Templates |
| `dashboard_templates` | APLICA_P2 | `control-plane/ui` | Plantillas dashboard |
| `events` | APLICA_P2 | `skuldbotweb/backend` | Marketing events opcional |
| `speakers` | APLICA_P2 | `skuldbotweb/backend` | Marketing events opcional |
| `signing` | APLICA_P1 | `control-plane/api` | Firma y evidencia legal |
| `signatories` | APLICA_P1 | `control-plane/api` | Firmantes autorizados |
| `lookups` | APLICA_P1 | `control-plane/api` | Catalogos de referencia |
| `webhooks` | APLICA_P0 | `control-plane/api` | Config de webhooks |
| `alerts` | APLICA_P1 | `control-plane/api` | Alerting ops |
| `gateway_telemetry` | APLICA_P1 | `control-plane/api` | Visibilidad de edge/gateway |
| `tenant_isolation` | APLICA_P0 | `control-plane/api` | Aislamiento tenant |
| `notification_routing` | APLICA_P1 | `control-plane/api` | Ruteo de notificaciones |
| `client_history` | APLICA_P1 | `control-plane/api` | Historial/auditoria admin CP |

## 5) Nexion-One Public/WS/Webhooks -> Skuld

| Modulo Publico | Decision | Destino Skuld | Nota |
|---|---|---|---|
| `public.leads` | APLICA_P0 | `skuldbotweb/backend` -> `control-plane/api` | Intake publico de leads |
| `public.appointments` | APLICA_P1 | `skuldbotweb/backend` -> `control-plane/api` | Agendamiento comercial |
| `public.website` | APLICA_P2 | `skuldbotweb/backend` | CMS/data website opcional |
| `public.applications` | NO_REUSAR_DESDE_NEXION | - | HR/careers fuera de foco |
| `public.checkout` | APLICA_P1 | `skuldbotweb/backend` -> `control-plane/api` | Checkout self-serve |
| `public.csat` | APLICA_P1 | `control-plane/api` | Encuesta soporte |
| `public.downloads` | APLICA_P2 | `skuldbotweb/backend` | Descargas de marketing |
| `public.unsubscribe` | APLICA_P0 | `control-plane/api` | Supresion global |
| `public.preferences` | APLICA_P1 | `control-plane/api` | Preferencias email |
| `public.tracking` | APLICA_P1 | `control-plane/api` | Tracking campañas |
| `public.contracts` | APLICA_P1 | `control-plane/api` | Contratos publicos |
| `public.templates` | APLICA_P1 | `deployers`, `control-plane/api` | Templates deployer |
| `public.dashboard_templates` | APLICA_P2 | `control-plane/api` | Catalogo BI opcional |
| `public.releases` | APLICA_P1 | `deployers`, `control-plane/api` | Releases instalables |
| `public.events` | APLICA_P2 | `skuldbotweb/backend` | Marketing events |
| `public.sign` | APLICA_P1 | `control-plane/api` | Firma publica tokenizada |
| `public.files` | APLICA_P1 | `control-plane/api` | Proxy seguro de archivos |
| `ws.notifications` | APLICA_P1 | `control-plane/api`, `control-plane/ui` | Notificaciones realtime |
| `webhooks.email` | APLICA_P0 | `control-plane/api` | Delivery/open/click/bounce |

## 6) Modulos explicitamente NO_REUSAR_DESDE_NEXION (resumen)
- `nexion`: `licenses`, `billing`, `billing_portal`, `marketplace`, `setup`, `nexionmind`
- `nexion-one core`: `nexionmind`
- `nexion-one admin/public`: `careers`, `applications` (HR), y cualquier modulo de CMS no prioritario para core producto

## 7) Orden de ejecucion sugerido de esta matriz
1. P0: licencias, cuota, usage, telemetry, instalaciones/fleet, CRM leads/sales, marketing core, email accounts/webhooks, security/tenant isolation, compliance runtime, audit runtime en orchestrator.
2. P1: soporte completo (tickets/SLA), command center, contracts/signing, deployers templates/releases, reports.
3. P2: CMS/website content ops, verticals, BI avanzado, collaboration, semantica expandida.
