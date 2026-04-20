# Instrucciones para Luis — Remediación CP API (25 Defectos)

Fecha: 2026-04-17
Branch: crear `fix/cp-api-code-review-remediation` desde master
Prioridad: MÁXIMA — bloquea avance hasta que esté limpio

## Contexto

Code review completo del CP API contra Quality Gates. 25 defectos encontrados en 6 prioridades.
TODO debe cerrarse. 0 deuda técnica.

---

## P0 — Controllers sin auth guards (CRÍTICO)

4 controllers tienen endpoints sin NINGÚN guard. Cualquiera puede llamarlos sin autenticación.

### D22: billing/billing.controller.ts — 7 endpoints sin guards

Agregar `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)` a nivel de clase.
Agregar `@RequirePermissions()` a cada endpoint:

```
POST /usage/ingest                      → BILLING_WRITE
GET  /usage/tenant/:tenantId            → BILLING_READ
GET  /revenue-share/partner/:partnerId  → BILLING_READ
POST /revenue-share/calculate           → BILLING_WRITE
POST /revenue-share/:id/approve         → BILLING_APPROVE
POST /payouts/partner/:partnerId        → BILLING_WRITE
GET  /payouts/partner/:partnerId        → BILLING_READ
```

Si `POST /usage/ingest` necesita auth por API key (no JWT), crear un guard específico `UsageIngestApiKeyGuard` que valide el header. NO dejarlo sin guard.

### D23: mcp/mcp.controller.ts — 8 endpoints sin guards

Los endpoints de tools/resources/call DEBEN estar protegidos. Health endpoints pueden tener un guard más ligero.

```
GET  /mcp/tools                → @UseGuards(JwtAuthGuard) + @RequirePermissions(MCP_READ)
GET  /mcp/resources            → @UseGuards(JwtAuthGuard) + @RequirePermissions(MCP_READ)
POST /mcp/tools/call           → @UseGuards(JwtAuthGuard) + @RequirePermissions(MCP_EXECUTE)
GET  /mcp/resources/*          → @UseGuards(JwtAuthGuard) + @RequirePermissions(MCP_READ)
GET  /mcp/capabilities         → @UseGuards(JwtAuthGuard) + @RequirePermissions(MCP_READ)
GET  /mcp/health               → Sin guard (health check público) — documentar por qué
GET  /mcp/health/live           → Sin guard (liveness probe) — documentar por qué
GET  /mcp/health/ready          → Sin guard (readiness probe) — documentar por qué
```

Para health endpoints: agregar comentario `// PUBLIC: Kubernetes liveness/readiness probes - no auth required` en cada uno.

### D24: schemas/schemas.controller.ts — 7 endpoints sin guards

```
POST /schemas                  → @RequirePermissions(SCHEMAS_WRITE)
POST /schemas/bulk             → @RequirePermissions(SCHEMAS_WRITE)
GET  /schemas                  → @RequirePermissions(SCHEMAS_READ)
GET  /schemas/for-release      → @RequirePermissions(SCHEMAS_READ)
GET  /schemas/:nodeType        → @RequirePermissions(SCHEMAS_READ)
GET  /schemas/export/typescript → @RequirePermissions(SCHEMAS_READ)
POST /schemas/mark-released    → @RequirePermissions(SCHEMAS_WRITE)
```

Agregar `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)` a nivel de clase.

### D25: mcp/metrics.controller.ts — 1 endpoint sin guard

```
GET /metrics → Sin guard si es para Prometheus scraping — documentar con comentario
```

Si es para Prometheus: `// PUBLIC: Prometheus metrics scrape endpoint - no auth required`
Si NO es para Prometheus: agregar `@UseGuards(JwtAuthGuard)`.

### Permisos nuevos

Agregar a `common/authz/permissions.ts`:

```typescript
// Billing
BILLING_READ: 'billing:read',
BILLING_WRITE: 'billing:write',
BILLING_APPROVE: 'billing:approve',

// MCP
MCP_READ: 'mcp:read',
MCP_EXECUTE: 'mcp:execute',

// Schemas
SCHEMAS_READ: 'schemas:read',
SCHEMAS_WRITE: 'schemas:write',
```

---

## P1 — TODOs en producción

### D1: integrations/payment/webhooks.controller.ts — 17 TODOs

Estos son handlers de Stripe webhook que están vacíos. Hay 2 opciones:

**Opción A (recomendada):** Implementar cada handler con la lógica mínima necesaria.
- `customer.subscription.created` → Crear/actualizar SubscriptionEntity
- `customer.subscription.updated` → Update status, period dates
- `customer.subscription.deleted` → Mark canceled, deactivate
- `invoice.created` → Create InvoiceEntity
- `invoice.paid` → Update status paid, calculate revenue share
- `invoice.payment_failed` → Update status, notify tenant
- `invoice.finalized` → Update InvoiceEntity
- `checkout.session.completed` → Create installation
- `account.updated` → Update Partner chargesEnabled/payoutsEnabled
- `account.application.deauthorized` → Mark partner unable to receive payouts
- `transfer.created/reversed` → Record in payout history
- `payout.paid/failed` → Update partner lifetimePayouts

Referencia: copiar lógica de Nexion si existe (buscar en `/nexion/nexion-one/backend/app/api/v1/webhooks/`).

**Opción B (si no hay tiempo):** Reemplazar cada TODO con:
```typescript
this.logger.warn(`Unhandled Stripe event: ${event.type}`, { eventId: event.id });
throw new NotImplementedException(`Stripe event ${event.type} handler not yet implemented`);
```

Esto es fail-fast — no silencia el evento, falla explícitamente. Pero DEBE implementarse completo antes de producción.

### D2: mcp/guards/mcp.guard.ts:22 — TODO API key validation

Implementar validación de API key:
```typescript
const apiKey = request.headers['x-api-key'];
if (!apiKey) return false;
// Validar contra DB o config
const isValid = await this.validateApiKey(apiKey);
return isValid;
```

### D3: tenants/tenants.service.ts:131,180 — TODOs de provisioning

Implementar o reemplazar con `throw new NotImplementedException('Tenant DB provisioning not yet implemented')`.

---

## P2 — Enums → Lookup Tables

### Cuáles migrar a lookup tables

Estos enums deben convertirse en lookup tables con CRUD, porque un admin puede necesitar cambiar valores sin deploy:

| Enum | Valores actuales | Tabla lookup |
|------|-----------------|--------------|
| `BotCategory` | EMAIL, INSURANCE, FINANCE, HR, SALES, HEALTHCARE, LOGISTICS, CUSTOM | `cp_bot_category_lookups` |
| `MarketplaceBotStatus` | DRAFT, PENDING_REVIEW, APPROVED, PUBLISHED, DEPRECATED, REJECTED | `cp_marketplace_bot_status_lookups` |
| `PartnerStatus` | PENDING, APPROVED, SUSPENDED, TERMINATED | `cp_partner_status_lookups` |
| `RevenueShareTier` | STARTER, ESTABLISHED, PREMIER | `cp_revenue_share_tier_lookups` |
| `TicketStatus` | OPEN, IN_PROGRESS, RESOLVED, CLOSED | `cp_ticket_status_lookups` |
| `TicketPriority` | LOW, NORMAL, HIGH, URGENT | `cp_ticket_priority_lookups` |
| `MarketplaceSubscriptionStatus` | ACTIVE, CANCELED | `cp_marketplace_subscription_status_lookups` |
| `MarketplaceSubscriptionPlan` | USAGE, PER_CALL, MONTHLY, HYBRID | `cp_marketplace_subscription_plan_lookups` |
| `LeadStatus` | NEW, WORKING, QUALIFIED, DISQUALIFIED | `cp_lead_status_lookups` |
| `ClientContactType` | PRIMARY, TECHNICAL, BUSINESS, LEGAL, BILLING, SUPPORT | `cp_client_contact_type_lookups` |
| `ClientAddressType` | BUSINESS, LEGAL, POSTAL, BILLING, SHIPPING | `cp_client_address_type_lookups` |

### Cuáles dejar como enum (OK)

Estos NO cambian sin deploy — son constantes del sistema:

| Enum | Por qué es OK |
|------|--------------|
| `UserRole` | Roles del sistema (skuld_admin, client_admin) — structural |
| `UserStatus` | ACTIVE/PENDING/SUSPENDED — lifecycle del sistema |
| `CpRoleScopeType` | PLATFORM/CLIENT — arquitectural |
| `RunnerType` | ATTENDED/UNATTENDED — tipo de infraestructura |
| `TenantEnvironment` | PRODUCTION/STAGING/DEV — infraestructura |
| `TenantDeploymentType` | SAAS/ON_PREMISE/HYBRID — arquitectural |
| `IntegrationType` | PAYMENT/STORAGE/EMAIL/GRAPH — tipos de provider |
| `SsoProtocol/Provider` | OIDC/AZURE_ENTRA_ID — protocolos fijos |
| `ExecutionMode` | CLOUD/RUNNER/HYBRID — infraestructura |
| `BillingInterval` | MONTHLY/YEARLY — solo 2 opciones fijas |
| `PaymentMethodType` | ACH/SEPA/CARD/INVOICE — tipos de pago fijos |

### Cuáles evaluar (borderline)

| Enum | Decisión recomendada |
|------|---------------------|
| `TenantStatus` | Dejar como enum — lifecycle controlado por sistema |
| `OrchestratorLifecycleStatus` | Dejar como enum — estados de máquina de estados fija |
| `SubscriptionStatus` | Dejar como enum — estados de Stripe, no configurables |
| `InvoiceStatusEnum` | Dejar como enum — estados de Stripe |
| `UsageRecordStatus` | Dejar como enum — PENDING/PROCESSED/FAILED es workflow fijo |
| `PricingModel` | Migrar a lookup — admin puede crear nuevos modelos de pricing |
| `ProductType` | Dejar como enum — tipos de producto del sistema |

### Implementación para cada lookup table

Estructura estándar (misma que contract lookups):

```typescript
// Entity: cp_bot_category_lookups
@Entity('cp_bot_category_lookups')
export class BotCategoryLookup {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 50, unique: true }) code: string;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'boolean', default: true }) isActive: boolean;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

Migration: una sola migración que crea las 11 tablas lookup + seed con los valores actuales de cada enum + agrega FK columns a las entidades que usan esos enums.

Nota: NO eliminar los enums todavía. Primero crear las lookup tables y FKs, luego en un segundo commit migrar los datos, luego en un tercero eliminar las columnas string/enum viejas. Misma estrategia que Nexion ADR-001.

---

## P3 — Entity columns sin varchar length

### D13: client.entity.ts

```
Línea 18: name → { type: 'varchar', length: 180 }
Línea 21: slug → { type: 'varchar', length: 120 }
Línea 30: billingEmail → { type: 'varchar', length: 180 }
```

### D14: tenant.entity.ts

```
Línea 47: name → { type: 'varchar', length: 180 }
Línea 50: slug → { type: 'varchar', length: 120 }
Línea 67: dbHost → { type: 'varchar', length: 255 }
Línea 73: dbName → { type: 'varchar', length: 128 }
Línea 76: dbUser → { type: 'varchar', length: 128 }
Línea 79: dbPassword → { type: 'varchar', length: 255 }
Línea 82: region → { type: 'varchar', length: 50 }
Línea 85: apiUrl → { type: 'varchar', length: 500 }
Línea 88: uiUrl → { type: 'varchar', length: 500 }
```

### D15: license.entity.ts

```
Línea 41: key → { type: 'varchar', length: 255 }
```

### D16: subscription.entity.ts

```
Línea 47: tenantName → { type: 'varchar', length: 180 }
Línea 51: stripeCustomerId → { type: 'varchar', length: 255 }
Línea 54: stripeSubscriptionId → { type: 'varchar', length: 255 }
Línea 65: stripePaymentMethodId → { type: 'varchar', length: 255 }
Línea 69: bankName → { type: 'varchar', length: 100 }
Línea 72: bankAccountLast4 → { type: 'varchar', length: 20 }
Línea 75: bankAccountType → { type: 'varchar', length: 50 }
Línea 104: lastPaymentError → { type: 'varchar', length: 500 }
Línea 110: suspensionReason → { type: 'varchar', length: 255 }
Línea 128: currency → { type: 'varchar', length: 10 }
Línea 135: botsDisabledReason → { type: 'varchar', length: 255 }
Línea 168: stripePaymentIntentId → { type: 'varchar', length: 255 }
Línea 171: stripeInvoiceId → { type: 'varchar', length: 255 }
Línea 174: stripeChargeId → { type: 'varchar', length: 255 }
Línea 181: currency (PaymentHistory) → { type: 'varchar', length: 10 }
Línea 207: errorCode → { type: 'varchar', length: 50 }
Línea 210: errorMessage → { type: 'varchar', length: 500 }
Línea 213: declineReason → { type: 'varchar', length: 255 }
Línea 217: invoicePeriod → { type: 'varchar', length: 10 }
```

### Nota importante

Estos cambios de length en entities NO requieren migration si la DB ya tiene las columnas como varchar sin limit (PostgreSQL varchar sin length = unlimited). Pero para consistencia y documentación del schema, DEBEN tener length en la entity.

---

## P4 — Funciones >100 LOC

### D18: billing.service.ts — ingestUsageBatch() (103 LOC)

Split en:
- `private validateUsageBatch(dto)` — validación de input
- `private deduplicateRecords(records)` — lógica de dedup
- `private persistUsageBatch(batch, records)` — persistencia

### D19: billing.service.ts — processUsageBatchAttempt() (126 LOC)

Split en:
- `private aggregateUsageEvents(records)` — agregación
- `private resolveStripeMetering(aggregated)` — resolución Stripe
- `private finalizeUsageBatch(batch, result)` — finalización

---

## P5 — Helpers compartidos

### D20: requireEntity() helper

Crear `common/utils/entity.util.ts`:

```typescript
export async function requireEntity<T>(
  repo: Repository<T>,
  where: FindOptionsWhere<T>,
  entityName: string,
): Promise<T> {
  const entity = await repo.findOne({ where });
  if (!entity) {
    throw new NotFoundException(`${entityName} not found`);
  }
  return entity;
}
```

Reemplazar las 15+ instancias de `findOne + throw NotFoundException` en todos los services.

### D21: normalizeString() — extender uso

`clients-shared.util.ts` ya tiene `normalizeOptionalString()`. Mover a `common/utils/string.util.ts` y usar en todos los modules que hacen `trim().toLowerCase()`.

---

## Orden de ejecución

1. **P0** primero — es seguridad crítica. Un commit.
2. **P1** segundo — eliminar TODOs con fail-fast. Un commit.
3. **P3** tercero — varchar lengths en entities. Un commit.
4. **P4 + P5** cuarto — refactor funciones + helpers compartidos. Un commit.
5. **P2** último — enum migration es el más grande, requiere migration de datos. Puede ser 2-3 commits.

## P-EXTRA — API Key de Clients NO es plaintext

### Contexto

El API key de clients en `clients.service.ts` se guarda en plaintext en la DB. Nexion lo guarda encrypted con Fernet (`enc:<ciphertext>`). Luis no copió de Nexion — inventó.

### Fix requerido

El API key DEBE guardarse encrypted en DB (AES-256-GCM, consistente con vault local del CLAUDE.md).

1. Al generar/regenerar: generar key con `crypto.randomBytes(32).toString('base64url')` con prefijo `skd_`
2. Almacenar en DB: encrypted con AES-256-GCM usando secret del servidor (CONTRACT_SIGNING_OTP_SECRET o similar)
3. Retornar plaintext al usuario UNA SOLA VEZ en la response de create/regenerate
4. Para validar requests: decrypt del valor en DB y comparar (o hash + lookup)
5. En responses normales (GET client): mostrar solo prefijo truncado (`skd_...xxxx`)

Referencia Nexion: `org_settings_secrets.py:56` → `encrypt_value()` → `enc:<ciphertext_fernet>`

### Regla violada

COMPLIANCE_FIRST_POLICY.md regla #1: "Los secrets NUNCA se almacenan en plaintext."

---

## Verificación

Cada commit debe pasar:
- `pnpm --filter @skuldbot/control-plane-api build` — 0 errores
- `pnpm --filter @skuldbot/control-plane-api test` — 0 fallos, tests no bajan
- `pnpm turbo run build` — monorepo completo

## Regla

0 deuda técnica. Todo se cierra en esta remediación. No se avanza con Clients ni Users hasta que estos 25 defectos estén cerrados.
