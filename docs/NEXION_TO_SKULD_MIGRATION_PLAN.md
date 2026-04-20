# Plan de Migracion: Nexion Control Plane → SkuldBot

**Fecha**: 2026-04-14
**Autor**: Albert (AI Architect)
**Fuente**: Nexion One (`/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/`)
**Destino CP**: `apps/control-plane/api/` + `apps/control-plane/ui/` (negocio Skuld LLC)
**Destino Orch**: `apps/orchestrator/api/` + `apps/orchestrator/ui/` (per-cliente)
**Stack origen**: Python / FastAPI / SQLAlchemy / Pydantic
**Stack destino**: TypeScript / NestJS / TypeORM / class-validator

**IMPORTANTE**: Ver `docs/CP_VS_ORCHESTRATOR_SEPARATION.md` para la distincion
entre lo que va en Control Plane (negocio) vs Orchestrator (operaciones del cliente).

---

## Principio Fundamental

Nexion es una plataforma de **datos**. SkuldBot es una plataforma de **automatizacion cognitiva**.
La arquitectura del CP es reutilizable, pero los modelos de negocio difieren:

| Dimension | Nexion (datos) | SkuldBot (automatizacion) |
|-----------|---------------|--------------------------|
| Producto core | Pipelines + conectores | Bots + agentes LLM |
| Unidad de venta | Data pods + almacenamiento | Bots alquilables + ejecuciones |
| Runtime | Cloud deployment gestionado | Runner en infra del cliente (hibrido) |
| Marketplace | Conectores de datos | Bots pre-construidos + nodos custom |
| Partners | Directorio de integradores | Creadores de bots + integradores RPA con revenue share |
| Compliance | Data residency | Evidence Packs + audit trails |
| Facturacion | Storage + pipelines + addons | Suscripcion + bots activos + eventos procesados |

---

## Modulos a Migrar

### FASE A: Infraestructura Base (Semanas 1-3)

Estos modulos son **identicos** entre Nexion y SkuldBot — solo cambian de Python a TypeScript.

#### A1. Provider Architecture (L)

**Origen Nexion**:
- `services/payment_provider_factory.py` — Factory pattern per-org
- `services/payment_provider.py` — Abstract interface
- `services/stripe_provider.py` — Stripe implementation
- `models/integration_config.py` — Config storage per-org
- `services/storage_service.py` — Cloud-agnostic storage
- `services/multi_email_service.py` — Multi-provider email con failover
- `services/sms_service.py` — Twilio SMS

**Adaptar a SkuldBot**:
```
apps/control-plane/api/src/providers/
├── provider.module.ts
├── interfaces/
│   ├── payment-provider.interface.ts
│   ├── email-provider.interface.ts
│   ├── storage-provider.interface.ts
│   └── sms-provider.interface.ts
├── payment/
│   ├── payment-provider.factory.ts
│   └── stripe.provider.ts
├── email/
│   ├── email-provider.factory.ts
│   ├── sendgrid.provider.ts
│   ├── aws-ses.provider.ts
│   ├── smtp.provider.ts
│   └── microsoft-graph.provider.ts
├── storage/
│   ├── storage-provider.factory.ts
│   ├── s3.provider.ts
│   ├── azure-blob.provider.ts
│   ├── gcs.provider.ts
│   └── local.provider.ts
├── sms/
│   ├── sms-provider.factory.ts
│   └── twilio.provider.ts
└── entities/
    └── integration-config.entity.ts
```

**Patron clave**: `IntegrationConfig` entity con `organization_id` nullable (null = global, non-null = per-tenant). Factory lee config de DB y retorna provider correcto.

**DoD**:
- [ ] IntegrationConfig entity con soporte multi-tenant
- [ ] Payment provider interface + Stripe implementation
- [ ] Email provider interface + SendGrid + SMTP implementations
- [ ] Storage provider interface + S3 + local implementations
- [ ] Factory pattern que lee config de DB
- [ ] Tests unitarios de cada provider

#### A2. Lookup Tables (M)

**Origen Nexion**: 24 lookup tables para enums flexibles administrables desde UI.

**Adaptar a SkuldBot**:
```typescript
// Entidad generica de lookup
@Entity()
export class Lookup {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() category: string;  // 'client_status', 'industry', 'bot_category', etc.
  @Column() code: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column({ nullable: true }) color: string;
  @Column({ nullable: true }) icon: string;
  @Column({ default: 0 }) sortOrder: number;
  @Column({ default: true }) isActive: boolean;
}
```

**Categorias para SkuldBot**:
- `client_status`: pending, trial, active, suspended, cancelled
- `industry`: healthcare, finance, insurance, government, telecom, energy
- `bot_category`: rpa, ai_agent, data_integration, compliance, hybrid
- `runner_status`: online, offline, busy, maintenance
- `execution_status`: queued, running, success, failed, cancelled
- `contract_type`: msa, tos, dpa, sla, baa
- `partner_tier`: platinum, gold, silver
- `partner_type`: bot_creator, integrator, reseller, technology

#### A3. RBAC Granular (L)

**Origen Nexion**:
- `models/role.py` — Role + Permission models
- `services/role_service.py` — CRUD + has_permission()
- `core/auth.py` — require_role(), require_permission()

**Adaptar a SkuldBot**:
```
apps/control-plane/api/src/rbac/
├── rbac.module.ts
├── entities/
│   ├── role.entity.ts
│   └── permission.entity.ts
├── rbac.service.ts
├── rbac.guard.ts           // @RequirePermission(resource, action) decorator
├── decorators/
│   └── require-permission.decorator.ts
└── rbac.controller.ts
```

**Resource Types para SkuldBot**:
```typescript
enum ResourceType {
  CLIENT = 'CLIENT',
  TENANT = 'TENANT',
  BOT = 'BOT',
  RUNNER = 'RUNNER',
  EXECUTION = 'EXECUTION',
  LICENSE = 'LICENSE',
  SUBSCRIPTION = 'SUBSCRIPTION',
  INVOICE = 'INVOICE',
  CONTRACT = 'CONTRACT',
  USER = 'USER',
  ROLE = 'ROLE',
  PARTNER = 'PARTNER',
  MARKETPLACE = 'MARKETPLACE',
  SETTINGS = 'SETTINGS',
  EVIDENCE_PACK = 'EVIDENCE_PACK',
  SYSTEM = 'SYSTEM',
}

enum ActionType {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  ADMIN = 'ADMIN',
  EXECUTE = 'EXECUTE',
}
```

#### A4. User Management Completo (M)

**Origen Nexion**:
- `models/user.py` — Admin users con MFA, login history, password policies
- `services/user_service.py` — CRUD + password + MFA
- `services/mfa_service.py` — TOTP + backup codes

**Adaptar a SkuldBot** (extender lo existente):
- Agregar: MFA (TOTP), login history, password policies, avatar upload
- Agregar: Custom role assignment (FK a Role)
- Agregar: SSO provider tracking (sso_provider field)

---

### FASE B: Negocio Core (Semanas 4-7)

Estos modulos se adaptan al modelo de negocio de SkuldBot.

#### B1. Licencias con Firma Criptografica (L)

**Origen Nexion**:
- `models/license.py` — Ed25519, grace periods, feature gating, heartbeat, audit
- `services/license_service.py` — Validacion, emision, revocacion

**Adaptar a SkuldBot** (diferencias):
- Features: `['studio', 'orchestrator', 'runner', 'ai_planner', 'evidence_pack', 'marketplace']`
- Limites: `max_bots`, `max_runners`, `max_executions_month`, `max_ai_tokens_month`
- Heartbeat: Runner reporta al Orchestrator, Orchestrator reporta al CP
- Grace period: Runner sigue ejecutando bots durante grace (no pierde trabajo en progreso)

```typescript
@Entity('licenses')
export class License {
  // ... (mismo patron que Nexion)
  @Column('simple-array') features: string[];
  @Column({ nullable: true }) maxBots: number;
  @Column({ nullable: true }) maxRunners: number;
  @Column({ nullable: true }) maxExecutionsMonth: number;
  @Column({ nullable: true }) maxAiTokensMonth: number;
  // Ed25519 signature
  @Column({ type: 'text' }) signature: string;
  @Column() signatureAlgorithm: string;
  @Column() publicKeyId: string;
  // Grace period
  @Column({ default: 30 }) gracePeriodDays: number;
  @Column({ type: 'timestamptz', nullable: true }) gracePeriodEndsAt: Date;
  // Audit
  @OneToMany(() => LicenseAudit, audit => audit.license)
  auditTrail: LicenseAudit[];
}
```

#### B2. Billing Adaptado a SkuldBot (L)

**Origen Nexion**: Stripe + subscriptions + invoices + line items

**Modelo de facturacion SkuldBot**:
1. **Suscripcion base**: Plan mensual (Starter, Professional, Enterprise)
2. **Por Runner activo**: Licencia mensual por runner registrado
3. **Por Bot activo**: Fee mensual por bot desplegado en produccion
4. **Por ejecucion**: Metering de eventos procesados (ej: FNOL por llamada)
5. **Revenue share**: % de ingresos de bots alquilados va al partner creador

```typescript
// Pricing plans adaptados a SkuldBot
interface SkuldPricingPlan {
  tier: 'starter' | 'professional' | 'enterprise' | 'custom';
  basePrice: { monthly: number; annual: number };
  includedRunners: number;
  includedBots: number;
  includedExecutions: number;
  pricePerExtraRunner: number;
  pricePerExtraBot: number;
  pricePerExecution: number;  // overage
  features: string[];
  addons: SkuldAddon[];
}
```

#### B3. Contratos (XL)

**Origen Nexion** (portar casi directo):
- `services/contract_service.py` (106KB) — Lifecycle completo
- `services/signing_service.py` (151KB) — Workflow de firmas
- `services/pdf_generator.py` — TipTap JSON → HTML → PDF

**Adaptar a SkuldBot**:
- Tipos de contrato: MSA, ToS, DPA (GDPR), SLA, BAA (HIPAA), NDA
- Gate: No se puede desplegar bots en produccion sin contratos firmados
- Evidence: Contrato firmado se incluye en Evidence Pack

#### B4. Tenant Isolation (M)

**Origen Nexion**:
- `models/tenant_isolation.py` — Scans, status, acciones

**Adaptar a SkuldBot**:
- Scan: Verificar que runners solo acceden datos de su tenant
- Scan: Verificar que bots no acceden secretos de otro tenant
- Acciones: warning → grace → suspend runner
- Integracion con Evidence Pack para audit

---

### FASE C: Partners & Marketplace (Semanas 8-10)

Esta es la parte MAS diferente entre Nexion y SkuldBot.

#### C1. Partner Program con Revenue Share (L)

**Origen Nexion**: Solo directorio publico (sin monetizacion)

**SkuldBot necesita** (nuevo):

```
apps/control-plane/api/src/partners/
├── partners.module.ts
├── entities/
│   ├── partner.entity.ts          // Perfil del partner
│   ├── partner-type.entity.ts     // Categorias (bot_creator, integrator, reseller)
│   ├── partner-payout.entity.ts   // Historial de pagos
│   └── revenue-share.entity.ts    // Configuracion de revenue share
├── partners.service.ts
├── partners.controller.ts
├── payouts.service.ts
└── revenue-share.service.ts
```

**Partner Entity** (extendido vs Nexion):
```typescript
@Entity('partners')
export class Partner {
  // ... (mismo que Nexion: name, slug, logo, tier, etc.)

  // NUEVO: Revenue share
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 30 })
  revenueSharePercent: number;  // % que recibe el partner

  // NUEVO: Metricas de negocio
  @Column({ default: 0 }) totalBotsSold: number;
  @Column({ default: 0 }) totalExecutions: number;
  @Column({ type: 'decimal', default: 0 }) totalRevenue: number;
  @Column({ type: 'decimal', default: 0 }) totalPaidOut: number;

  // NUEVO: Marketplace relationship
  @OneToMany(() => MarketplaceBot, bot => bot.partner)
  bots: MarketplaceBot[];

  // NUEVO: Payouts
  @OneToMany(() => PartnerPayout, payout => payout.partner)
  payouts: PartnerPayout[];

  // NUEVO: Portal access
  @Column({ nullable: true }) portalUserId: string;
  @Column({ default: false }) portalEnabled: boolean;
}
```

**Revenue Share Flow**:
```
Cliente alquila bot del Marketplace
  → Ejecucion registrada en Usage
  → Billing genera Invoice al cliente
  → Revenue Share calcula % para partner
  → Payout acumulado mensual
  → Partner recibe pago (Stripe Connect o manual)
```

#### C2. Bot Marketplace (L)

**Origen Nexion**: Connector marketplace (adaptar concepto)

**SkuldBot Marketplace**:
```typescript
@Entity('marketplace_bots')
export class MarketplaceBot {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column() slug: string;
  @Column({ type: 'text' }) description: string;
  @Column() category: string;  // fnol, claims, data_entry, compliance, etc.
  @Column('simple-array') industries: string[];  // healthcare, insurance, finance
  @Column('simple-array') tags: string[];

  // Pricing
  @Column({ type: 'decimal' }) pricePerMonth: number;
  @Column({ type: 'decimal', nullable: true }) pricePerExecution: number;
  @Column({ default: false }) isFree: boolean;

  // Partner (creador)
  @ManyToOne(() => Partner) partner: Partner;
  @Column() partnerId: string;

  // Bot package
  @Column() botPackageUrl: string;  // .skb file en storage
  @Column() botVersion: string;
  @Column() minRuntimeVersion: string;

  // Status
  @Column({ default: 'draft' }) status: string;  // draft, review, published, deprecated
  @Column({ default: false }) isFeatured: boolean;
  @Column({ default: false }) isCertified: boolean;  // reviewed por Skuld team

  // Metrics
  @Column({ default: 0 }) installCount: number;
  @Column({ default: 0 }) totalExecutions: number;
  @Column({ type: 'decimal', default: 0 }) avgRating: number;
  @Column({ default: 0 }) ratingCount: number;

  // Compliance
  @Column('simple-array', { nullable: true }) requiredPolicies: string[];  // hipaa, soc2, pci
  @Column({ default: false }) evidencePackRequired: boolean;
}
```

---

### FASE D: Marketing & Website (Semanas 11-13)

#### D1. CMS / Blog (M)

**Origen Nexion** (portar directo):
- `models/blog.py` — Posts con TipTap JSON
- `api/v1/admin/blog.py` — CRUD admin
- `api/v1/public/website.py` — Public endpoints

#### D2. Email Marketing (L)

**Origen Nexion** (portar directo):
- `models/email_campaign.py` — Campaigns, recipients, tracking
- `models/email_list.py` — Listas segmentadas
- `services/email_marketing_service.py` — Envio, tracking, unsubscribe

#### D3. Events & Webinars (S)

**Origen Nexion** (portar directo):
- `models/event.py` — Eventos, registros
- `api/v1/admin/events.py` — Admin CRUD
- `api/v1/public/events.py` — Public listing + registration

#### D4. Website Public API (M)

**Origen Nexion** (adaptar):
- `api/v1/public/website.py` — Endpoints publicos
- Lead capture, media proxy, content API

**Adaptar para SkuldBot**:
```
GET /api/public/plans          → Pricing plans
GET /api/public/bots           → Marketplace catalog
GET /api/public/partners       → Partner directory
GET /api/public/blog           → Blog posts
GET /api/public/events         → Events
GET /api/public/faqs           → FAQs
GET /api/public/case-studies   → Customer stories
POST /api/public/leads         → Lead capture (demo request)
POST /api/public/newsletter    → Newsletter signup
```

#### D5. Partners Public Directory (M)

**Origen Nexion** (portar + extender):
- Directorio publico de partners en el website
- Filtros por tipo, tier, industria, especialidad
- Perfiles con logo, descripcion, certificaciones, highlights
- **NUEVO**: Link a bots del partner en el marketplace

---

### FASE E: Operaciones & Infraestructura (Semanas 14-16)

#### E1. Alerts & Monitoring (M)

**Origen Nexion**: `api/v1/admin/alerts.py`

#### E2. Webhook Management (M)

**Origen Nexion**: `api/v1/admin/webhooks.py` (70KB)

#### E3. Notification Routing (S)

**Origen Nexion**: `api/v1/admin/notification_routing.py`

#### E4. Multi-Cloud Deployers (XL)

**Origen Nexion**: `nexion-deployer-aws/`, `nexion-deployer-azure/`

**Adaptar**: En vez de deployar la plataforma completa (como Nexion), deployamos **Runners**:
- Terraform para provisionar Runner en AWS/Azure/GCP
- Configuracion automatica: conectar Runner al Orchestrator
- Security groups, networking, secrets

---

## Resumen de Esfuerzo

| Fase | Semanas | Tareas | Esfuerzo |
|------|:-------:|:------:|:--------:|
| A. Infra Base | 1-3 | 4 | ~3 semanas |
| B. Negocio Core | 4-7 | 4 | ~4 semanas |
| C. Partners & Marketplace | 8-10 | 2 | ~3 semanas |
| D. Marketing & Website | 11-13 | 5 | ~3 semanas |
| E. Operaciones | 14-16 | 4 | ~3 semanas |
| **Total** | **16 semanas** | **19 modulos** | **~4 meses** |

---

## Prioridad si hay Recursos Limitados

Si solo puedes hacer 5 cosas:

1. **Provider Architecture** — Sin esto nada funciona (email, storage, payments)
2. **RBAC Granular** — Sin esto no es enterprise
3. **Licencias** — Sin esto no cobras
4. **Billing + Stripe** — Sin esto no cobras
5. **Partners + Revenue Share** — Sin esto no tienes marketplace rentable

---

## Principios de Adaptacion

1. **No copiar ciegamente** — Nexion es Python/FastAPI, SkuldBot es NestJS. Adaptar patrones, no traducir linea por linea.
2. **Respetar el modelo de negocio** — Bots alquilables, no data pods. Runners, no pipelines.
3. **Mantener lo que funciona** — Lo que ya existe en Skuld CP y funciona, no se reemplaza.
4. **Revenue share es nuevo** — Nexion no tiene monetizacion de partners. SkuldBot si.
5. **Evidence Pack es unico** — Nexion no tiene nada equivalente. Es diferenciador de SkuldBot.
6. **BYO everything** — Cada tenant configura sus providers (LLM, email, storage, etc.)

---

*Plan preparado por Albert - (c) 2026 Skuld, LLC*
