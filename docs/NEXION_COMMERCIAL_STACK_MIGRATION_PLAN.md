# Nexion Commercial Stack -> Skuldbot Adaptation Plan

## 1) Objetivo
Adaptar en Skuldbot el dominio comercial maduro de Nexion One para acelerar:
- pipeline de ventas (`lead -> cliente`),
- growth por email marketing,
- monetizacion conectada a licencias, bots rentados y prompt catalog.

Alcance explicito:
- `skuldbotweb` continua como web oficial vigente de Skuld (no se copia ni se reemplaza por `nexion-website`).
- Este plan aplica a dominio funcional/comercial del `control-plane` y a integraciones operativas, no a clonado visual.

Este plan complementa:
- `docs/ENTERPRISE_RPA_AI_AGENT_MASTER_PLAN.md`
- `docs/NEXION_REUSE_MATRIX.md`

## 2) Fuentes confirmadas (Nexion One)
APIs:
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/sales.py`
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/leads.py`
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/marketing_campaigns.py`
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/marketing_templates.py`
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/marketing_lists.py`
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/email_accounts.py`
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/public/leads.py`
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/webhooks/email.py`
Modelos:
- `lead.py`, `lead_activity.py`
- `email_campaign.py`, `email_campaign_recipient.py`
- `email_template.py`
- `email_list.py`, `email_list_member.py`
- `email_account.py`, `transactional_email_log.py`
- `client_contact.py`, `partner.py`

## 3) Principio de migracion
- No copiar HTTP layer FastAPI 1:1.
- Si copiar dominio, estados, validaciones y reglas de negocio.
- Reimplementar API y persistencia en NestJS/TypeScript.
- Reusar patrones de seguridad y auditoria existentes en Skuldbot.
- En UI, adaptar patrones funcionales pero no identidad visual: Skuld mantiene branding propio.

## 3.1 Guardrails de adaptacion UX/UI (obligatorio)
- Logo: siempre `Skuld` en todos los módulos migrados (no usar marca Nexion).
- Colores: no replicar paleta Nexion; usar tokens de color propios de Skuld.
- Diseño: adaptar layout, componentes y jerarquía visual al design system de Skuld.
- Componentes: conservar comportamiento UX valioso (filtros, tablas, funnels, campañas), rediseñando look&feel.
- Navegación: integrar rutas y patrones de Skuldbot Studio/Control Plane, evitando IA slop y pantallas genéricas.
- Accesibilidad: contraste AA, estados focus visibles, navegación por teclado en vistas críticas.
- Regla de calidad: cualquier pantalla migrada debe parecer nativa de Skuld, no “skin de Nexion”.

## 4) Arquitectura destino en Skuldbot
`control-plane/api/src/crm/*`:
- leads, pipeline, actividades, vendedores, reportes.
`control-plane/api/src/marketing/*`:
- campañas, templates, listas/audiencias, miembros, analytics de engagement.
`control-plane/api/src/integrations/email/*`:
- proveedores, cuentas de envio por proposito, pruebas y health.
`control-plane/api/src/integrations/*`:
- capa unificada provider-first para `payment`, `billing`, `storage`, `email`, `identity`.
- contratos por servicio + registry de proveedores + health checks.
`control-plane/ui/src/app/(dashboard)/crm/*`:
- vistas de pipeline, rep performance, funnel.
`control-plane/ui/src/app/(dashboard)/marketing/*`:
- editor/lista de campañas, templates, listas, deliverability.
`orchestrator/api/src/dispatch/*` y `orchestrator/api/src/runs/*`:
- ejecución de automatizaciones disparadas por eventos comerciales.
- requisito transversal: orchestrator cloud-agnostic (sin acoplamiento exclusivo a un cloud).
- matriz de instalación obligatoria: `AWS`, `Azure`, `GCP` y `on-premise`.
- despliegue oficial vía Docker (imágenes firmadas) + Helm/Kubernetes para entornos enterprise.
`control-plane/ui/src/design-tokens/*`:
- tokens de marca Skuld (color, tipografía, spacing, sombras, radios, estados).

## 5) Contratos de datos minimos
`Lead`:
- contacto, empresa, source, status, asignacion, score, timestamps de conversion/perdida.
`LeadActivity`:
- tipo, titulo, descripcion, agendamiento, completitud, metadatos.
`SalesRepProfile`:
- usuario, manager, meta mensual, stats agregadas.
`EmailCampaign`:
- contenido (html/text/design_json), audiencia, estado, schedule, tracking flags.
`EmailCampaignRecipient`:
- estado de entrega, eventos, tracking id/message id, errores.
`EmailList` y `EmailListMember`:
- listas manual/dinamica/all_leads, engagement score, tags, unsubscribe.
`EmailAccount`:
- provider, purpose, sender identity, límites, verificación.
`TransactionalEmailLog`:
- auditoría de envíos transaccionales y aperturas.

## 6) Contratos API sugeridos (v1)
CRM admin:
- `GET /api/crm/leads`
- `POST /api/crm/leads`
- `PATCH /api/crm/leads/:id`
- `POST /api/crm/leads/:id/assign`
- `POST /api/crm/leads/:id/convert`
- `POST /api/crm/leads/:id/lost`
- `POST /api/crm/leads/:id/activities`
- `GET /api/crm/sales/reps`
- `GET /api/crm/sales/funnel`
Marketing admin:
- `GET /api/marketing/campaigns`
- `POST /api/marketing/campaigns`
- `POST /api/marketing/campaigns/:id/schedule`
- `POST /api/marketing/campaigns/:id/send-test`
- `POST /api/marketing/campaigns/:id/send`
- `GET /api/marketing/templates`
- `POST /api/marketing/templates`
- `GET /api/marketing/lists`
- `POST /api/marketing/lists`
- `POST /api/marketing/lists/:id/members/import-csv`
Email accounts:
- `GET /api/email-accounts`
- `POST /api/email-accounts`
- `POST /api/email-accounts/:id/test`
Público:
- `POST /api/public/leads`
Webhooks:
- `POST /api/webhooks/email/sendgrid`
- `POST /api/webhooks/email/ses`

## 7) Seguridad y compliance enterprise
- Secretos de proveedores de correo en vault; nunca persistir secretos en claro.
- Respuestas API con masking de campos sensibles.
- Supresion global (unsubscribe/complaint/hard bounce) obligatoria antes de enviar.
- Minimización de PII/PHI en telemetría y eventos al control plane global.
Auditoría inmutable de acciones críticas:
- creación/actualización de cuentas de envío,
- lanzamientos de campaña,
- cambios de segmentación,
- exportaciones de listas.
Controles anti-abuso:
- rate limit para endpoints públicos,
- protección webhook por firma/HMAC,
- deduplicación e idempotencia de eventos.
- rotación y validación de credenciales por proveedor en la capa de integraciones.

## 7.1 RBAC requerido para CRM/Marketing
Roles mínimos:
- `tenant_admin`: control total del dominio comercial del tenant.
- `sales_manager`: gestión de leads, asignaciones y funnel.
- `sales_rep`: gestión de leads/actividades asignadas.
- `marketing_manager`: campañas, listas, templates, segmentación.
- `marketing_operator`: ejecución operativa sin cambios de seguridad.
- `compliance_officer`: lectura completa + aprobación de controles.
- `auditor_readonly`: solo lectura y export de evidencia permitida.

Restricciones críticas:
- solo `tenant_admin`/`security_admin` puede gestionar cuentas de envío y credenciales.
- `sales_rep` no puede exportar listas masivas ni cambiar suppressions globales.
- `marketing_operator` no puede modificar pricing, licencias ni políticas globales.

## 7.2 Contrato de comunicación CP <-> Orchestrator para dominio comercial
- eventos de campaña y engagement via canal de uso/telemetría con idempotencia (`event_id`).
- sincronización de entitlements antes de ejecutar campañas premium o nodos de prompts premium.
- fallback local en orquestador si CP no responde: solo operaciones permitidas por caché vigente.
- validación mutua fuerte (mTLS + JWT firmado), con revocación de credenciales comprometidas.
- auditoría de toda operación cross-plane: actor, tenant, recurso, acción, resultado.
- neutralidad cloud en el canal: endpoints/contratos no deben depender de features propietarias de un solo proveedor.

## 8) Plan de ejecucion por olas
Ola 0 (1 semana):
- diseño TS entities + migraciones + contratos DTO.
Ola 1 (1-2 semanas):
- CRM core (lead, activity, assign, pipeline, rep stats).
Ola 2 (1-2 semanas):
- marketing core (lists, members, templates, campaigns draft/schedule).
Ola 3 (1 semana):
- cuentas de envío multi-provider y prueba de conexión.
Ola 4 (1 semana):
- webhooks de engagement + suppression + analytics base.
Ola 5 (1 semana):
- integración billing/usage y dashboards de negocio.
Ola 6 (1 semana):
- hardening de seguridad, pruebas E2E y evidencia SOC2/HIPAA.

## 9) Definition of Done
- Dominio CRM y marketing operativo en Control Plane con RBAC.
- Sin secretos en claro en DB, logs ni respuestas API.
- Métricas de funnel y engagement visibles por tenant.
- Eventos de campaña integrados a usage/billing.
- UI comercial adaptada a identidad Skuld (logo, paleta, componentes y navegación).
- Comunicación CP<->Orchestrator con autenticación fuerte, idempotencia y degradación controlada.
Pruebas E2E para:
- captura lead público,
- flujo campaña completa,
- webhook events,
- suppressions obligatorias,
- trazabilidad/auditoría.

## 10) Riesgos y mitigacion
- Riesgo: scope comercial crece sin límite.
- Mitigación: congelar MVP en CRM+Campaigns+Accounts+Webhooks.
- Riesgo: fuga de PII/PHI por telemetría.
- Mitigación: data contracts + redaction pipeline + revisión de logs.
- Riesgo: baja entregabilidad por configuración de proveedores.
- Mitigación: health checks, warm-up, límites por cuenta y alertas.
