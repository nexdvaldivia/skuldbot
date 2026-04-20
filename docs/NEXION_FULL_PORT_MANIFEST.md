# Nexion → SkuldBot: Manifiesto Completo de Porteo

**Fecha**: 2026-04-15
**Autorizado por**: Dubiel Valdivia (propietario de ambas plataformas)
**Regla**: Copiar la logica exacta de Nexion, adaptar solo el stack (Python→TypeScript) y el dominio (datos→automatizacion)

---

## Principio

> No reinventar. Nexion tiene codigo probado en produccion.
> Copiar la logica, adaptar la sintaxis, cambiar el vocabulario del dominio.

---

## 1. Providers (Servicios de Infraestructura)

### 1.1 Payment Provider (Stripe)
**Nexion fuente**: `services/payment_provider_factory.py` + `services/stripe_provider.py` + `services/stripe_service.py`
**Destino**: `apps/control-plane/api/src/integrations/payment/`

Que copiar:
- Factory con org_id OBLIGATORIO (sin fallback silencioso)
- Stripe provider: customers, subscriptions, invoices, payment intents
- Stripe Connect: partner accounts, transfers, payouts
- Webhook handling con signature verification
- ACH bank account setup
- Billing portal (customer self-service)
- Line items: core, add_on (en SkuldBot: bot_subscription, runner_license, execution_overage)
- Subscription schedules para cambios next-cycle

### 1.2 Email System
**Nexion fuente**: `services/multi_email_service.py` (99KB) + `models/email_account.py`
**Destino**: `apps/control-plane/api/src/email/`

Que copiar:
- Modelo `EmailAccount` con purpose: support, billing, notifications, marketing
- Multi-provider failover: SendGrid → AWS SES → SMTP → Microsoft Graph
- Rate limiting per provider: SendGrid 100/s, SES 14/s, Graph 30/s, SMTP 10/s
- Email tracking: open pixel (1x1 GIF), click link rewriting
- Unsubscribe tokens (HMAC-signed, stateless)
- Template rendering con variables `{{first_name}}`, `{{company}}`, etc.
- Base template wrapping para branding consistente
- Critical templates en filesystem con DB fallback

### 1.3 Email Templates
**Nexion fuente**: `templates/email/` + `services/ticket_notification_service.py`
**Destino**: `apps/control-plane/api/src/email/templates/`

Templates de sistema a portar:
- `ticket_base.html` — Base layout para todos los emails de soporte
- `ticket_created_customer` — Confirmacion de ticket al cliente
- `ticket_created_team` — Alerta de nuevo ticket al equipo
- `ticket_assigned` — Notificacion al agente asignado
- `ticket_comment_customer` — Reply de staff al cliente
- `ticket_comment_agent` — Reply del cliente al agente
- `ticket_status_changed` — Cambio de estado al cliente
- `ticket_resolved` — Ticket resuelto al cliente
- `sla_warning` — 80% de SLA al agente + escalacion
- `sla_breach` — SLA excedido al agente + escalacion
- `csat_survey` — Encuesta de satisfaccion (con botones 1-5)
- `installation_approved` — Instalacion aprobada
- `signing_otp` — OTP para firma de contratos
- `welcome` — Bienvenida a nuevo usuario
- `password_reset` — Reset de password

### 1.4 SMS (Twilio)
**Nexion fuente**: `services/sms_service.py`
**Destino**: `apps/control-plane/api/src/sms/`

Que copiar:
- Lazy init del client Twilio desde IntegrationConfig (DB)
- Global (sin per-tenant)
- Metodos: send_otp, send_sms, is_sms_enabled
- Phone normalization E.164
- Verificacion A2P registration status

### 1.5 Storage
**Nexion fuente**: `services/storage_service.py`
**Destino**: `apps/control-plane/api/src/integrations/storage/`

Que copiar:
- Cloud-agnostic: Azure Blob / S3 / local
- **Relative paths** — almacenar paths relativos, no URLs absolutas (permite cambiar provider)
- Upload, download, get_full_url, get_base_url
- Config desde SystemSettings (no IntegrationConfig)

---

## 2. Modulos de Negocio

### 2.1 Contracts
**Nexion fuente**: `services/contract_service.py` (106KB) + `services/signing_service.py` (151KB) + `services/pdf_generator.py` + `models/contract.py` (30KB)
**Destino**: `apps/control-plane/api/src/contracts/`

Que copiar:
- Modelo Contract con versions, lookups (tipo, jurisdiccion, compliance framework)
- Status workflow: DRAFT → PUBLISHED → DEPRECATED → ARCHIVED
- Variable substitution en contratos: `{{legal_name}}`, `{{contact_email}}`, etc.
- Signing service: envelopes, recipients, events, audit trail
- Signature methods: checkbox, typed, drawn, upload
- Legal evidence: IP, user agent, timestamp
- PDF generation: TipTap JSON → HTML → PDF (WeasyPrint en Nexion, Puppeteer en SkuldBot)
- Contract requirement service: gates antes de suscribir
- Contract types: MSA, ToS, DPA, SLA, BAA, NDA

### 2.2 Support / Tickets
**Nexion fuente**: `services/ticket_service.py` + `services/ticket_notification_service.py` + `services/support_config_service.py` + `services/sla_service.py` + `tasks/support_tasks.py` + `models/ticket.py` + `models/support_config.py` + `api/v1/admin/support.py` + `api/v1/admin/support_config.py` + `api/v1/support.py` + `api/v1/public/csat.py`
**Destino**: `apps/control-plane/api/src/support/`

Que copiar:
- Ticket CRUD con ticket number generation (TKT-YYYY-NNNN)
- Comments (staff/customer) con internal notes
- Attachments con storage
- Activity audit trail
- Tags y ticket merge
- CSAT surveys (auto-create on resolve, public endpoint sin auth)
- SLA: policy matching por priority/category/client tier, business hours, holidays
- Auto-assignment rules: round-robin, team, load-balance
- Canned responses
- Custom fields per category
- Status workflow con transitions configurables
- Notification por evento (template-based)
- Background tasks: SLA breach check, auto-close resolved
- Config admin: categories, priorities, statuses, business hours, holidays, SLA, templates, rules, canned responses, custom fields

### 2.3 Email Marketing
**Nexion fuente**: `services/email_marketing_service.py` (26KB) + `models/email_campaign.py` + `models/email_campaign_recipient.py` + `models/email_list.py` + `models/email_list_member.py` + `api/v1/admin/marketing_campaigns.py` (44KB) + `api/v1/admin/marketing_templates.py`
**Destino**: `apps/control-plane/api/src/marketing/`

Que copiar:
- Campaign CRUD: regular, automated, trigger-based
- Design editor con JSON schema
- A/B testing config
- Scheduling con validacion
- Recipient lists con segmentacion
- Member status: active, unsubscribed, bounced, complained
- Merge fields: `{{first_name}}`, `{{company}}`, etc.
- Tracking: opens, clicks, bounces, complaints
- Batch sending con rate limiting
- Unsubscribe management
- Campaign analytics: sent, delivered, opened, clicked, bounced

### 2.4 Blog / CMS
**Nexion fuente**: `models/blog.py` + `models/blog_author.py` + `api/v1/admin/blog.py` + `api/v1/public/website.py`
**Destino**: `apps/control-plane/api/src/blog/`

Que copiar:
- Blog posts con TipTap JSON content
- Authors
- Categories con slug y sort_order
- Status: draft, published, archived
- Public API para el website
- Post reordering

### 2.5 Events
**Nexion fuente**: `models/event.py` + `api/v1/admin/events.py` + `api/v1/public/events.py`
**Destino**: `apps/control-plane/api/src/events/`

Que copiar:
- Event CRUD: webinars, demos, meetups
- Registration form
- Attendee management
- Public listing endpoint
- Scheduling y notifications

### 2.6 Partners
**Nexion fuente**: `models/partner.py` + `schemas/partner.py` + `api/v1/admin/partners.py` + `api/v1/admin/partner_types.py` + `api/v1/public/website.py`
**Destino**: `apps/control-plane/api/src/partners/`

Que copiar de Nexion:
- Partner entity: name, slug, logo, tier (platinum/gold/silver), contact
- Partner types: many-to-many
- Specialties, industries, certifications (JSON arrays)
- Highlights (label/value pairs)
- Featured flag, sort_order, is_active
- Public directory endpoint
- Admin CRUD + reorder

**Agregar para SkuldBot** (nuevo, no existe en Nexion):
- `canPublishToMarketplace` flag
- Partner approval workflow
- Revenue share config per partner
- Payout history
- Portal access (portalUserId, portalEnabled)
- Bot submission tracking

### 2.7 Careers
**Nexion fuente**: `api/v1/public/website.py` (jobs endpoint)
**Destino**: `apps/control-plane/api/src/careers/`

Que copiar:
- Job openings CRUD
- Public listing endpoint
- Application form (si existe)

---

## 3. Website Public API

**Nexion fuente**: `api/v1/public/website.py` (87KB)
**Destino**: `apps/control-plane/api/src/public/`

Endpoints a portar:
```
GET /api/public/plans          → Pricing plans
GET /api/public/bots           → Marketplace catalog (adaptar de connectors)
GET /api/public/partners       → Partner directory
GET /api/public/blog           → Blog posts
GET /api/public/events         → Events
GET /api/public/faqs           → FAQs
GET /api/public/case-studies   → Customer stories
GET /api/public/careers/jobs   → Job openings
POST /api/public/leads/intake  → Lead capture
GET /api/public/media/*        → Media proxy (storage URL hiding)
```

---

## 4. Deployer (Orchestrator)

**Nexion fuente**: `nexion-deployer-aws/` + `nexion-deployer-azure/`
**Destino**: `apps/deployer/` (nuevo)

### AWS Deployer
Terraform a portar:
- `networking.tf` — VPC, subnets, security groups, NAT
- `ecs.tf` — ECS clusters, task definitions (API, UI, workers)
- `ecr.tf` — Container registry
- `database.tf` — RDS PostgreSQL con encryption, backups
- `redis.tf` — ElastiCache Redis
- `storage.tf` — S3 con versioning, encryption, lifecycle
- `secrets_manager.tf` — AWS Secrets Manager
- `monitoring.tf` — CloudWatch logs, metrics, alarms
- `iam.tf` — Task roles, S3 policies

### Azure Deployer
Terraform a portar:
- `resource_group.tf`
- `app_service.tf` — App Service for containers
- `container_registry.tf` — ACR
- `storage.tf` — Blob Storage
- `database.tf` — Azure PostgreSQL
- `redis.tf` — Azure Cache for Redis
- `networking.tf` + `private_endpoints.tf`
- `keyvault.tf` — Key Vault
- `monitoring.tf` — Application Insights
- `policies.tf` — Azure Policy
- `locks.tf` — Resource locks

### Tauri Desktop Wizard
- Wizard de deployment (React + Rust)
- Contract acceptance flow
- Installer verification (OTP)
- Bootstrap super admin
- Modos: standard, resume_repair, clean_reinstall
- Naming convention: `{client}-{env}-{region}-{random}`

### Diferencia vs Nexion
En Nexion se despliega la plataforma completa. En SkuldBot se despliega un **Orchestrator** que se conecta al Control Plane:
- Register con CP al finalizar deploy
- Heartbeat automatico
- License validation
- Usage reporting

---

## 5. Vocabulario de Dominio (Adaptaciones)

| Nexion | SkuldBot | Contexto |
|--------|----------|---------|
| connector | bot | Unidad de producto |
| pipeline | execution/run | Ejecucion |
| data pod | runner | Unidad de compute |
| NexionMind | AI Planner | Feature de AI |
| installation | orchestrator instance | Deployment del cliente |
| data source | trigger | Entrada de datos |
| data destination | target/output | Salida de datos |
| connector pack | bot bundle | Paquete de productos |
| vertical package | industry pack | Paquete por industria |

---

## Orden de Porteo (segun Master Plan)

| Sprint | Modulos |
|--------|---------|
| S1 | Providers: Payment (Stripe per-tenant), Email (multi-account), SMS (Twilio global), Storage (cloud-agnostic) |
| S2 | Contracts (lifecycle + signing + PDF) |
| S4 | Partners (directory + marketplace + revenue share) |
| S5 | Blog, Email Marketing, Events, Careers, Website Public API |
| S6 | Support (tickets + SLA + CSAT + notifications + config) |
| S8 | Deployer (Tauri + Terraform AWS/Azure), Email Templates System |

---

*(c) 2026 Skuld, LLC — Propiedad intelectual de Dubiel Valdivia, ambas plataformas*
