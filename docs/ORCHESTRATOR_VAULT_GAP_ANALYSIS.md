# Orchestrator Vault — Gap Analysis

Fecha: 2026-04-19
Estado: ANÁLISIS — input para planificación
Contexto: El engine tiene vault completo (local). El Orchestrator no tiene vault API.
Compliance: COMPLIANCE_FIRST_POLICY.md aplica — todo debe ser compliance-first.

---

## 1. Estado actual

### Lo que TENEMOS (Engine/Studio side)

| Componente | Estado | Compliance |
|-----------|:------:|:----------:|
| Local Vault AES-256-GCM + PBKDF2 | ✅ | HIPAA/PCI ✅ |
| 7 vault providers (LOCAL, ORCH, AWS, AZURE, HC, ENV, DOTENV) | ✅ | ✅ |
| Fallback chain con prioridad | ✅ | ✅ |
| Robot Framework keywords | ✅ | ✅ |
| DSL credential type `${vault.xxx}` | ✅ | ✅ |
| Compiler excluye secrets del .skb | ✅ | ✅ |
| SecretValue wrapper (redacta en logs) | ✅ | ✅ |
| Audit log local (JSON lines) | ✅ | HIPAA §164.312 ✅ |

### Lo que FALTA (Orchestrator side)

| Componente | Estado | Criticidad | Compliance requirement |
|-----------|:------:|:----------:|----------------------|
| Vault CRUD API (`/api/v1/vault/secrets/*`) | ❌ | CRÍTICO | Runner no puede resolver secrets en producción |
| Secret storage encrypted en DB | ❌ | CRÍTICO | COMPLIANCE_FIRST_POLICY §1: secrets nunca plaintext |
| Envelope encryption per tenant | ❌ | CRÍTICO para regulado | COMPLIANCE_FIRST_POLICY §6: data key per tenant + KMS |
| Policies de acceso por bot/runner | ❌ | ALTO | COMPLIANCE_FIRST_POLICY §3: mínimo privilegio |
| Audit trail centralizado de accesos | ❌ | ALTO | COMPLIANCE_FIRST_POLICY §5: audit toda operación sensible |
| Admin UI para gestión de secrets | ❌ | ALTO | Operabilidad |
| Key rotation management | ❌ | ALTO | COMPLIANCE_FIRST_POLICY §6: rotation obligatoria |
| Secret versioning | ❌ | MEDIO | Rollback en caso de error |
| Secret expiration/TTL | ❌ | MEDIO | Rotación automática |
| Bulk operations (import/export) | ❌ | BAJO | Migración entre entornos |

---

## 2. Cómo lo tiene Nexion

| Pieza | Cómo lo resuelve Nexion | Gap SkuldBot |
|-------|------------------------|-------------|
| System secrets | Azure Key Vault (producción), .env (dev) | Similar — tenemos providers pero no el wiring en Orchestrator |
| Org secrets | IntegrationConfig table, Fernet encryption | No tenemos IntegrationConfig equivalente |
| Secret masking en responses | `****[last4]` para campos sensibles | SecretValue wrapper existe en engine, falta en Orchestrator API |
| Runtime retrieval | Secrets baked at deployment en IntegrationConfig, no runtime API | SkuldBot necesita runtime API porque bots resuelven en ejecución |
| Audit | AuditEvent model — tracks modifications, no reads | Necesitamos audit de reads también (COMPLIANCE_FIRST_POLICY §5) |
| Rotation | Manual (updated_by/updated_at) | No tenemos ni manual |
| Per-org isolation | IntegrationConfig.organization_id FK | No tenemos equivalente |

### Diferencia clave Nexion vs SkuldBot

Nexion inyecta secrets al deployment — el runner ya tiene los valores cuando arranca.
SkuldBot resuelve secrets en runtime — el bot pide al vault durante ejecución.

Esto hace que SkuldBot necesite un **vault API en el Orchestrator** que Nexion no necesita.
Es más seguro (secret en memoria efímera, no persistido en runner) pero requiere más infraestructura.

---

## 3. Lo que hay que construir (compliance-first)

### Fase 1: Vault API Core + Provider Architecture (BLOQUEANTE para producción)

**Principio: Multi-cloud + On-premise obligatorio.**

El Orchestrator NO implementa un vault propio acoplado. Expone una API unificada que delega
a vault providers configurables por tenant. Cambiar de Azure Key Vault a HashiCorp Vault
o a un vault local on-premise = cambiar configuración, no código.

```
Orchestrator Vault API (interfaz única)
         │
         ├── VaultProviderInterface (contrato)
         │        │
         │        ├── AzureKeyVaultProvider      (cloud)
         │        ├── AwsSecretsManagerProvider   (cloud)
         │        ├── GcpSecretManagerProvider    (cloud)
         │        ├── HashiCorpVaultProvider      (on-premise / cloud)
         │        ├── LocalEncryptedProvider      (on-premise, AES-256-GCM en DB)
         │        └── EncryptedDbProvider         (fallback, PostgreSQL + encryption)
         │
         └── VaultProviderFactory (resuelve provider por tenant config)
```

**VaultProviderInterface (contrato que todos implementan):**

```typescript
interface VaultProviderInterface {
  getSecret(name: string, version?: number): Promise<SecretValue>;
  setSecret(name: string, value: string, metadata?: SecretMetadata): Promise<void>;
  deleteSecret(name: string): Promise<void>;
  listSecrets(prefix?: string): Promise<SecretListItem[]>;
  rotateSecret(name: string, newValue: string): Promise<void>;
  getSecretMetadata(name: string): Promise<SecretMetadata>;
  getSecretVersions(name: string): Promise<SecretVersion[]>;
  healthCheck(): Promise<ProviderHealth>;
}
```

**Provider por tenant:** Cada tenant configura su vault provider en `IntegrationConfig`:

```json
{
  "tenantId": "tenant-uuid",
  "integrationType": "VAULT",
  "provider": "azure_keyvault",
  "config": {
    "vaultUrl": "https://kv-cliente.vault.azure.net/",
    "authMethod": "managed_identity"
  }
}
```

Un tenant puede usar Azure KV, otro AWS SM, otro HashiCorp on-premise. Todos consumen la misma API.

**Endpoints:**

```
POST   /api/v1/vault/secrets                    — create secret
GET    /api/v1/vault/secrets                    — list secrets (names only, no values)
GET    /api/v1/vault/secrets/:name              — get secret value (via provider)
PUT    /api/v1/vault/secrets/:name              — update secret
DELETE /api/v1/vault/secrets/:name              — delete secret (soft)
GET    /api/v1/vault/secrets/:name/metadata     — get metadata without value
POST   /api/v1/vault/secrets/:name/rotate       — rotate secret value
GET    /api/v1/vault/secrets/:name/versions     — list versions
GET    /api/v1/vault/secrets/:name/audit        — audit trail for this secret
POST   /api/v1/vault/health                     — vault provider health check
```

**Entity: `VaultSecretMetadata` (solo metadata — los valores viven en el provider)**

```
id (UUID PK)
tenantId (UUID FK — isolation per tenant)
name (varchar 255, unique per tenant)
secretType (varchar 50 — credential, api_key, connection_string, totp_secret, certificate)
providerRef (varchar 500 — referencia al secret en el provider externo)
description (text, nullable)
tags (jsonb — categorización)
version (integer, default 1)
isActive (boolean, default true)
expiresAt (timestamp, nullable — TTL support)
lastAccessedAt (timestamp, nullable)
lastRotatedAt (timestamp, nullable)
accessCount (integer, default 0)
createdByUserId (UUID)
updatedByUserId (UUID)
deletedAt (timestamp, nullable — soft delete)
createdAt, updatedAt
```

**Nota:** Los VALORES de los secrets NO se guardan en la DB del Orchestrator (excepto
con EncryptedDbProvider para on-premise sin vault externo). Los valores viven en el
vault provider del tenant (Azure KV, AWS SM, HashiCorp, etc.).

**Vault embebido por defecto (zero-config start):**

El Orchestrator INCLUYE un vault funcional out-of-the-box. El cliente instala el Orchestrator
y ya tiene vault funcionando — sin instalar HashiCorp, sin configurar Azure KV, sin nada extra.

Mismo principio que DuckDB first en Database Manager: **funciona day 1, upgrade después.**

```
Día 1 (zero-config):
  Cliente instala Orchestrator → EncryptedDbProvider activo por defecto
  → PostgreSQL del Orchestrator + AES-256-GCM → vault listo
  → Bots pueden resolver secrets inmediatamente

Cuando el cliente quiera más:
  Configura Azure KV → cambia provider en config → misma API, otro backend
  O instala HashiCorp Vault → cambia provider → mismo resultado
  O migra a AWS → cambia provider → cero cambio de código
```

**EncryptedDbProvider (default, embebido):**

Es el LocalVault del engine (`local_vault.py`) portado a NestJS/TypeORM. Almacena
secrets encrypted con AES-256-GCM en PostgreSQL — la misma DB que ya usa el Orchestrator.
No requiere infraestructura adicional.

- Para desarrollo: funciona igual que el Studio
- Para on-premise sin vault externo: producción válida con AES-256-GCM
- Para clientes que empiezan: zero friction, zero infra extra
- Upgrade path: migrar a Azure KV / AWS SM / HashiCorp cuando estén listos

**HashiCorp Vault (opción on-premise avanzada):**

Para clientes on-premise que necesitan HA, políticas avanzadas, o ya tienen HashiCorp
en su infraestructura. Es el estándar de la industria para on-premise.
El cliente lo instala, configura el provider, y el Orchestrator lo consume.

**Jerarquía de providers por entorno:**

| Entorno | Provider default | Upgrade path |
|---------|:----------------:|-------------|
| **Desarrollo** | EncryptedDbProvider | — |
| **On-premise básico** | EncryptedDbProvider | HashiCorp Vault |
| **On-premise enterprise** | HashiCorp Vault | — |
| **Azure** | Azure Key Vault | — |
| **AWS** | AWS Secrets Manager | — |
| **GCP** | GCP Secret Manager | — |
| **Hybrid** | Provider por tenant | Cada tenant elige el suyo |

**Compliance requirements para esta fase:**
- Multi-cloud: mismo código, diferente provider por config
- On-premise: EncryptedDbProvider como fallback sin dependencia cloud
- Per-tenant isolation (tenantId FK, queries siempre filtradas)
- Audit event por cada read/write/delete (en DB del Orchestrator, no en el provider)
- Response nunca incluye el valor en list/metadata endpoints
- GET value requiere autenticación de runner (API key o mTLS)
- Rate limiting en GET value (prevenir brute force de secrets)
- Secret value masked en logs del Orchestrator
- Provider health check para detectar vault unreachable

### Fase 2: Access Policies (BLOQUEANTE para enterprise)

**Endpoints:**

```
POST   /api/v1/vault/policies                  — create policy
GET    /api/v1/vault/policies                  — list policies
GET    /api/v1/vault/policies/:policyId        — get policy
PUT    /api/v1/vault/policies/:policyId        — update policy
DELETE /api/v1/vault/policies/:policyId        — delete policy
```

**Entity: `SecretAccessPolicy`**

```
id (UUID PK)
tenantId (UUID FK)
name (varchar 180)
description (text, nullable)
subjectType (varchar 50 — bot, runner, user, role)
subjectId (varchar 255 — bot ID, runner ID, user ID, role name)
secretPattern (varchar 255 — wildcard: "erp-*", "db-prod-*", "*")
permissions (varchar[] — read, write, rotate, delete)
effect (varchar 10 — ALLOW, DENY)
priority (integer — higher priority wins on conflict)
isActive (boolean, default true)
validFrom (timestamp, nullable)
validTo (timestamp, nullable)
createdByUserId (UUID)
createdAt, updatedAt
```

**Evaluation logic:**
1. Collect all policies for the subject (bot/runner/user)
2. Filter by secretPattern match
3. Sort by priority DESC
4. First match wins (ALLOW or DENY)
5. Default: DENY (mínimo privilegio)
6. DENY always beats ALLOW at same priority

### Fase 3: Envelope Encryption (BLOQUEANTE para regulado)

- Data key per tenant generada aleatoriamente
- Data key wrapped por KMS/HSM master key (Azure KV, AWS KMS, etc.)
- Secret values encrypted con data key del tenant
- Compromiso de una data key = solo ese tenant expuesto
- Key rotation: unwrap → re-encrypt with new data key → wrap new data key
- Audit log de operaciones wrapKey/unwrapKey

### Fase 4: Admin UI

- Página de secrets en Orchestrator UI (CP UI)
- CRUD visual con masking de valores
- Audit trail viewer
- Policy editor
- Rotation management
- Bulk import/export (encrypted)

---

## 4. Autenticación del Runner al Vault

El Runner necesita autenticarse con el Orchestrator para pedir secrets. Opciones:

| Método | Seguridad | Complejidad | Recomendación |
|--------|:---------:|:-----------:|:-------------:|
| API Key (header) | Media | Baja | Para empezar |
| mTLS (certificado) | Alta | Media | Para producción regulada |
| JWT con corta expiración | Alta | Media | Alternativa a mTLS |
| OIDC/OAuth2 | Alta | Alta | Para enterprise con IdP |

**Recomendación:** API Key para fase 1 (ya tenemos el patrón en clients). mTLS para fase 3 (regulado).

---

## 5. Flujo runtime completo (target)

```
Bot ejecuta → nodo necesita secret → ${vault.erp-sap-mfa-secret}
    │
    ▼
Runner detecta provider=ORCHESTRATOR
    │
    ▼
Runner envía: GET /api/v1/vault/secrets/erp-sap-mfa-secret
  Headers: x-runner-id, x-bot-id, x-api-key
    │
    ▼
Orchestrator:
  1. Autentica runner (API key/mTLS)
  2. Identifica tenant (del runner)
  3. Evalúa policy: ¿bot X puede leer secret Y? → ALLOW/DENY
  4. Si DENY → 403 + audit event (denial)
  5. Si ALLOW → decrypt secret (data key del tenant) → return encrypted value
  6. Audit event: secret.accessed (botId, secretName, runnerId, IP)
    │
    ▼
Runner recibe valor → memoria efímera → bot usa → descarta
```

---

## 6. Relación con módulos del CP pendientes

| Módulo CP | Depende de vault? | Cómo |
|-----------|:-----------------:|------|
| Contracts (DONE) | No directamente | Usa signing secrets, no vault API |
| Clients (DONE) | Sí — API key encryption | Ya usa secret-crypto.util.ts, no vault API |
| Users/Auth | Sí — JWT secrets, MFA secrets | Usa configService, no vault API |
| Licenses | Sí — license keys, signing keys | Necesita vault para keys de firma |
| Billing/Payments | Sí — Stripe keys, payment secrets | Necesita vault para keys de pago |
| Connectors | Sí — connection strings per tenant | **Depende directamente de vault API** |
| Installations | Sí — deployment secrets | **Depende directamente de vault API** |
| MFA TOTP (futuro) | Sí — TOTP shared secrets | **Depende directamente de vault API** |

**Connectors, Installations, y MFA TOTP no pueden funcionar en producción sin vault API en Orchestrator.**

---

## 7. Orden de implementación sugerido

| Orden | Qué | Depende de | Bloquea |
|:-----:|-----|-----------|---------|
| 1 | Vault API Core (Fase 1) | Nada — puede empezar ya | Connectors, Installations, MFA TOTP en prod |
| 2 | Access Policies (Fase 2) | Fase 1 | Enterprise deployment |
| 3 | Envelope Encryption (Fase 3) | Fase 2 | Deploy regulado (HIPAA/SOC2/PCI) |
| 4 | Admin UI (Fase 4) | Fase 1 | Operabilidad |

**Nota:** Fase 1 podría portarse de Nexion IntegrationConfig como base,
adaptando de "secrets baked at deployment" a "runtime API resolution".

---

## 8. Compliance checklist para implementación

Per COMPLIANCE_FIRST_POLICY.md, cada fase DEBE cumplir:

- [ ] Secrets encrypted at rest (AES-256-GCM mínimo)
- [ ] Per-tenant isolation (tenantId en every query)
- [ ] Audit event por cada access (read, write, delete, deny)
- [ ] Values never in logs
- [ ] Values never in list/metadata responses
- [ ] Rate limiting en value retrieval
- [ ] Default DENY (mínimo privilegio)
- [ ] Rotation support (at least manual)
- [ ] Fail-closed: si vault unreachable, bot falla — no fallback inseguro
- [ ] Anti-regression guardrail: test que detecta escritura directa sin encrypt

---

## Versionado

| Versión | Fecha | Cambio |
|:-------:|-------|--------|
| 1.0 | 2026-04-19 | Gap analysis inicial |
