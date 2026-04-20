# Instrucciones para Luis — Contracts Full Port

Fecha: 2026-04-16
Branch: `feat/s3-contracts-full-port`
Prioridad: MÁXIMA — Albert espera esto completo para portar UI

## Estado actual

Tienes 34 endpoints. Nexion tiene 127. Faltan 93.

## ANTES DE AVANZAR: 3 Defectos pendientes (D1-D3)

Estos defectos del review anterior DEBEN corregirse en tu primer commit:

### D1: `sendTemplateForSignature` tiene 140 LOC — MUST split

Archivo: `contracts/contract-signing.service.ts`

Split en métodos privados:
- `private createSigningEnvelope(...)` — crea envelope + recipients
- `private createEnvelopeRecipients(...)` — crea y guarda recipients con OTP
- `private sendSigningNotifications(...)` — envía emails a recipients

### D2: Utility methods duplicados entre services — MUST extraer

`ensureClientExists()` y `ensureTenantBelongsToClient()` están duplicados en:
- `contracts.service.ts`
- `contract-signing.service.ts`

Extraer a: `contracts/contracts-access.util.ts` o un base service compartido.
Ambos services deben importar del mismo lugar.

### D3: ClientContacts solo tiene 3 tests — MUST agregar happy paths

Archivo: `clients/client-contacts.service.spec.ts`

Agregar tests para:
- list (retorna contactos ordenados por isPrimary DESC, fullName ASC)
- getById (retorna contacto correcto)
- create exitoso (crea con todos los campos)
- update exitoso (actualiza parcialmente)
- update email a email existente de otro contacto (ConflictException)

---

## PASO 2: Lookups CRUD (9 endpoints)

### Entities nuevas (3)

Copiar estructura EXACTA de Nexion. Referencia: `/nexion/nexion-one/backend/app/models/contract.py`

1. **ContractTypeLookup** — tabla: `cp_contract_type_lookups`
   - id (UUID PK)
   - code (varchar 50, unique, indexed)
   - name (varchar 100)
   - description (text, nullable)
   - isActive (boolean, default true)
   - sortOrder (integer, default 0)
   - contractLevel (varchar 20, default "installation")
   - contractScope (varchar 20, default "global")
   - productScopes (jsonb, nullable)
   - createdAt, updatedAt

2. **ContractJurisdictionLookup** — tabla: `cp_contract_jurisdiction_lookups`
   - id (UUID PK)
   - code (varchar 100, unique, indexed)
   - name (varchar 100, unique, indexed)
   - description (text, nullable)
   - isActive (boolean, default true)
   - sortOrder (integer, default 0)
   - createdAt, updatedAt

3. **ContractComplianceFrameworkLookup** — tabla: `cp_contract_compliance_framework_lookups`
   - id (UUID PK)
   - code (varchar 50, unique, indexed)
   - name (varchar 100, unique, indexed)
   - description (text, nullable)
   - isActive (boolean, default true)
   - sortOrder (integer, default 0)
   - createdAt, updatedAt

### Service: `contract-lookups.service.ts` (extender el existente)

Métodos requeridos (copiar lógica de Nexion `contract_service.py`):
- `listContractTypes(includeInactive: boolean)`
- `createContractType(dto)`
- `updateContractType(lookupId, dto)`
- `listJurisdictions(includeInactive: boolean)`
- `createJurisdiction(dto)`
- `updateJurisdiction(lookupId, dto)`
- `listComplianceFrameworks(includeInactive: boolean)`
- `createComplianceFramework(dto)`
- `updateComplianceFramework(lookupId, dto)`

### Controller endpoints (9 nuevos)

```
GET    /lookups/contract-types
POST   /lookups/contract-types
PATCH  /lookups/contract-types/:lookupId
GET    /lookups/jurisdictions
POST   /lookups/jurisdictions
PATCH  /lookups/jurisdictions/:lookupId
GET    /lookups/compliance-frameworks
POST   /lookups/compliance-frameworks
PATCH  /lookups/compliance-frameworks/:lookupId
```

### DTOs

- `CreateContractTypeLookupDto` — code, name, description?, isActive?, sortOrder?, contractLevel?, contractScope?, productScopes?
- `UpdateContractTypeLookupDto` — PartialType del create
- `CreateJurisdictionLookupDto` — code, name, description?, isActive?, sortOrder?
- `UpdateJurisdictionLookupDto` — PartialType del create
- `CreateComplianceFrameworkLookupDto` — code, name, description?, isActive?, sortOrder?
- `UpdateComplianceFrameworkLookupDto` — PartialType del create

### Migration

- `1765550000000-CreateContractLookups.ts`
- 3 tablas con IF NOT EXISTS
- Indexes en code (unique), name
- DOWN con DROP IF EXISTS

### Tests

- CRUD completo para cada lookup type
- Duplicate code rejection
- Update inexistente → 404
- includeInactive filter

---

## PASO 3: Signatories CRUD + Signature Upload (10 endpoints)

### Entity: Extender `ContractSignatory` existente

Agregar campos faltantes de Nexion `authorized_signatory.py`:
- companyName (varchar 255, default "Skuld, LLC")
- signatureImage (text, nullable) — base64 de imagen de firma
- initialsImage (text, nullable) — base64 de iniciales
- signatureText (varchar 255, nullable)
- signatureUpdatedAt (timestamp, nullable)
- deletedAt (timestamp, nullable) — soft delete

### Controller endpoints (10 nuevos)

```
GET    /signatories                              — list_signatories
GET    /signatories/default                      — get_default_signatory
GET    /signatories/for-contract                 — get_signatory_for_contract (query: contractType)
GET    /signatories/:signatoryId                 — get_signatory
POST   /signatories                              — create_signatory
PATCH  /signatories/:signatoryId                 — update_signatory
DELETE /signatories/:signatoryId                 — delete_signatory (soft delete)
POST   /signatories/:signatoryId/signature       — upload_signature (base64 image)
POST   /signatories/:signatoryId/initials        — upload_initials (base64 image)
POST   /signatories/:signatoryId/set-default     — set_as_default
```

Nota: `activate` y `deactivate` los mapeas al PATCH con `isActive: true/false`.

### Service: `contract-signatory.service.ts` (nuevo o extender legal)

- listSignatories(includeInactive?)
- getDefaultSignatory()
- getSignatoryForContract(contractType)
- getSignatoryById(id)
- createSignatory(dto)
- updateSignatory(id, dto)
- deleteSignatory(id) — soft delete
- uploadSignature(id, base64Image) — valida formato, guarda, actualiza signatureUpdatedAt
- uploadInitials(id, base64Image)
- setAsDefault(id) — clear previous default, set new

---

## PASO 4: Signatory Policies CRUD (8 endpoints)

### Entity nueva: `ContractSignatoryPolicy`

Tabla: `cp_contract_signatory_policies`. Copiar de Nexion `contract.py`:
- id (UUID PK)
- contractType (varchar 50, FK→contract_type_lookups.code, indexed)
- signatoryId (UUID, FK→contract_signatories.id, indexed)
- priority (integer, default 100)
- isActive (boolean, default true, indexed)
- validFrom (timestamp, nullable)
- validTo (timestamp, nullable)
- notes (text, nullable)
- createdByUserId (UUID, nullable)
- createdAt, updatedAt

### Controller endpoints (8 nuevos)

```
GET    /signatory-policies                       — list
GET    /signatory-policies/history               — list with inactive
GET    /signatory-policies/:policyId             — get
POST   /signatory-policies                       — create
PATCH  /signatory-policies/:policyId             — update
POST   /signatory-policies/:policyId/activate    — activate
POST   /signatory-policies/:policyId/deactivate  — deactivate
POST   /signatory-policies/resolve-preview       — preview resolution for a contract type
```

---

## PASO 5: Templates completo (10 endpoints nuevos)

### Endpoints faltantes

```
POST   /templates/:templateId/new-version        — create new version from existing
DELETE /templates/:templateId                     — archive (soft)
GET    /templates/:templateId/variables           — get variable definitions
GET    /templates/:templateId/variables/catalog   — get variable catalog (all available vars)
POST   /templates/:templateId/lint                — validate template
POST   /templates/:templateId/variables/resolve   — resolve variables for preview
POST   /templates/:templateId/upload-pdf          — upload PDF file
GET    /templates/:templateId/preview-pdf         — preview PDF
DELETE /templates/:templateId/pdf                 — remove PDF
PUT    /templates/:templateId/signature-fields    — update signature field positions
```

### Service methods faltantes (copiar de Nexion `contract_service.py`)

- `archiveTemplate(templateId)` — status → ARCHIVED
- `createNewVersion(templateId, newVersion, versionNotes?)` — copia de versión existente
- `getTemplateVariables(templateId)` — retorna definiciones de variables
- `getVariableCatalog(templateId)` — retorna catálogo completo (system + custom vars)
- `lintTemplate(templateId)` — valida variables, campos requeridos, estructura
- `resolveTemplateVariables(templateId)` — resuelve variables con valores reales
- `uploadTemplatePdf(templateId, file)` — sube PDF, calcula hash, cuenta páginas
- `previewTemplatePdf(templateId)` — genera/retorna preview
- `removeTemplatePdf(templateId)` — elimina PDF asociado
- `updateSignatureFields(templateId, fields)` — actualiza posiciones de campos de firma

### Validación en publishTemplate (FIX)

Antes de publicar, validar:
- Template tiene título
- Template tiene al menos documentJson o PDF
- Template tiene variableDefinitions válidas (si las hay)
- Si no cumple → BadRequestException con detalle

---

## PASO 6: Acceptances completo (6 endpoints nuevos)

### Campos faltantes en entity `ContractAcceptance`

Agregar (de Nexion `contract.py` → ContractAcceptance):
- contentSnapshotHash (varchar 64) — hash del contenido firmado
- contentSnapshot (text, nullable) — snapshot del HTML
- signatureHash (varchar 64, nullable) — hash de la firma del cliente
- countersignedAt (timestamp, nullable)
- countersignedBy (varchar 255, nullable)
- skuldsignatoryId (UUID, FK→signatories.id, nullable)
- skuldSignatoryName (varchar 255, nullable)
- skuldSignatoryTitle (varchar 255, nullable)
- skuldSignatoryEmail (varchar 255, nullable)
- skuldSignatureHash (varchar 64, nullable)
- skuldResolutionSource (varchar 20, nullable) — "policy", "manual", "default"
- skuldResolvedAt (timestamp, nullable)
- signedPdfUrl (varchar 500, nullable)
- signedPdfHash (varchar 64, nullable)
- variablesUsed (jsonb, nullable)
- effectiveDate (timestamp)
- expirationDate (timestamp, nullable)
- supersededById (UUID, FK→self, nullable)
- revokedAt (timestamp, nullable)
- revocationReason (text, nullable)

### Controller endpoints (6 nuevos)

```
POST   /accept                                   — accept contract (legal evidence completa)
POST   /acceptances/:acceptanceId/countersign     — countersign by Skuld signatory
POST   /acceptances/:acceptanceId/revoke          — revoke acceptance
GET    /acceptances/:acceptanceId/evidence/verify  — verify evidence integrity
GET    /client/:clientId/status                   — get client contract status
GET    /acceptances/:acceptanceId/rendered         — get rendered acceptance HTML
```

### Service methods (copiar de Nexion `contract_service.py`)

- `acceptContract(dto)` — captura legal evidence completa: IP, user agent, session, signature, content hash, snapshot
- `countersignContract(acceptanceId, countersignedBy)` — resolve signatory por policy, firma, genera PDF firmado
- `revokeAcceptance(acceptanceId, reason)` — marca revocado, desactiva
- `verifyAcceptanceEvidence(acceptanceId)` — verifica hashes, integridad
- `getClientContractStatus(clientId)` — status completo por contrato
- `getRenderedAcceptance(acceptanceId)` — HTML renderizado con variables resueltas

---

## PASO 7: Requirements + Validation completo (6 endpoints nuevos)

```
POST   /validate                                 — validate contracts for subscription
GET    /required                                  — get required contracts for plan
POST   /validate/vertical                         — validate contracts for vertical
GET    /required/vertical/:verticalSlug           — get required for vertical
POST   /validate/addon                            — validate contracts for addon
GET    /templates/:templateId/render/:clientId     — render contract for specific client
```

---

## PASO 8: Signing Envelopes Admin completo (17 endpoints nuevos)

### Endpoints faltantes (de Nexion `admin/signing.py`)

```
POST   /envelopes                                — create envelope
POST   /envelopes/from-templates                 — create from template IDs
PATCH  /envelopes/:envelopeId                    — update envelope
GET    /envelopes/:envelopeId/status              — get status summary
POST   /envelopes/:envelopeId/void                — void envelope
POST   /envelopes/:envelopeId/suspend             — suspend
POST   /envelopes/:envelopeId/resume              — resume
POST   /envelopes/:envelopeId/reassign-recipient   — reassign to new email
POST   /envelopes/:envelopeId/force-close          — force close
POST   /envelopes/:envelopeId/resend               — resend to recipient
GET    /envelopes/:envelopeId/delivery-history     — delivery event log
POST   /envelopes/:envelopeId/offline-evidence/upload — upload offline signed doc
POST   /envelopes/:envelopeId/complete-offline      — complete with offline evidence
POST   /envelopes/:envelopeId/documents             — add document to envelope
GET    /envelopes/:envelopeId/documents/:docId      — get document
PATCH  /envelopes/:envelopeId/documents/:docId      — update document
DELETE /envelopes/:envelopeId/documents/:docId      — delete document
```

### Entity nueva: `SigningDocument`

Tabla: `cp_signing_documents` (de Nexion `signing.py`)
- id (UUID PK)
- envelopeId (UUID FK)
- name (varchar 255)
- contentType (varchar 20, default "pdf")
- content (text, nullable) — HTML content
- contentHash (varchar 64)
- order (integer, default 0)
- templateId (UUID FK→template_versions, nullable)
- templateVersion (varchar 20, nullable)
- variables (jsonb, nullable)
- createdAt, updatedAt

### Service methods (copiar de Nexion `signing_service.py`)

Todos los métodos de envelope management: create, send, void, suspend, resume, reassign, force-close, resend, delivery history, offline evidence, document CRUD.

---

## PASO 9: Public Signing API (13 endpoints nuevos)

### Controller nuevo: `public-signing.controller.ts`

SIN JWT — usa token-based auth (signing_token del recipient).

```
GET    /public/sign/:token                        — get signing page data
POST   /public/sign/:token/view                   — mark as viewed
POST   /public/sign/:token/client-info             — update client info
GET    /public/sign/:token/otp/status              — get OTP status
POST   /public/sign/:token/otp/request-email       — request email OTP
POST   /public/sign/:token/otp/verify-email        — verify email OTP
POST   /public/sign/:token/otp/request-sms         — request SMS OTP
POST   /public/sign/:token/otp/verify-sms          — verify SMS OTP
POST   /public/sign/:token/sign                    — sign documents
POST   /public/sign/:token/decline                 — decline signing
GET    /public/sign/:token/documents/:docId/preview-pdf   — preview PDF
GET    /public/sign/:token/documents/:docId/final-pdf     — download final signed PDF
GET    /public/sign/:token/documents/:docId/signed-pdf    — download signed PDF
```

### Entity nueva: `SigningOtp`

Tabla: `cp_signing_otps` (de Nexion `signing_otp.py`)
- id (UUID PK)
- envelopeId (UUID FK)
- recipientId (UUID FK)
- otpCode (varchar 6) — hashed, NOT plaintext
- otpType (varchar 10) — "email" | "sms"
- destination (varchar 255) — email or phone
- expiresAt (timestamp)
- verifiedAt (timestamp, nullable)
- attempts (integer, default 0)
- ipAddress (varchar 45)
- userAgent (varchar 500, nullable)
- isValid (boolean, default true)
- createdAt, updatedAt

### Security

- Token validation: signing_token is unique, indexed, has expiry
- OTP codes MUST be hashed (SHA-256 + pepper) — NEVER stored in plaintext
- Rate limiting on OTP requests (max 5 per hour per recipient)
- Rate limiting on OTP verification (max 5 attempts per OTP)
- All actions log IP + user agent

---

## PASOS ADICIONALES: Renewals + Signed Documents (11 endpoints)

### Contract Renewals (7 endpoints)

De Nexion `contract_renewals.py`:

```
POST   /contract-renewals/admin/require-reacceptance   — force reacceptance for clients
POST   /contract-renewals/admin/:requirementId/waive   — waive requirement
GET    /contract-renewals/admin/all                     — list all requirements
GET    /contract-renewals/clients/:clientId/pending     — get pending for client
POST   /contract-renewals/clients/:clientId/accept/:requirementId — accept pending
POST   /contract-renewals/admin/jobs/send-reminders     — trigger reminder job
POST   /contract-renewals/admin/jobs/process-expired    — trigger expiration job
```

Entity: `ContractRenewalRequirement` (de Nexion `contract_renewal.py`)

### Signed Documents (4 endpoints)

De Nexion `signed_documents.py`:

```
GET    /signed-documents                          — list signed documents
GET    /signed-documents/:documentId              — get signed document
GET    /signed-documents/:documentId/view         — view HTML
GET    /signed-documents/:documentId/download     — download PDF
```

---

## RESUMEN TOTAL

| Paso | Endpoints nuevos | Acumulado | Descripción |
|:----:|:----------------:|:---------:|-------------|
| D1-D3 | 0 | 34 | Fix defectos pendientes |
| 2 | 9 | 43 | Lookups CRUD |
| 3 | 10 | 53 | Signatories + signature upload |
| 4 | 8 | 61 | Signatory Policies |
| 5 | 10 | 71 | Templates completo |
| 6 | 6 | 77 | Acceptances completo |
| 7 | 6 | 83 | Requirements + Validation |
| 8 | 17 | 100 | Signing Envelopes admin |
| 9 | 13 | 113 | Public Signing API |
| 10 | 11 | 124 | Renewals + Signed Documents |
| **Total** | **93 nuevos** | **127** | **Paridad completa con Nexion** |

## Reglas de ejecución

1. Branch: `feat/s3-contracts-full-port` (ya existe)
2. Un commit atómico por paso
3. Cada paso incluye: entity + service + controller + DTOs + migration + tests
4. Tests: CRUD completo + edge cases + happy paths
5. Build: `pnpm --filter @skuldbot/control-plane-api build` PASS
6. Tests: `pnpm --filter @skuldbot/control-plane-api test` PASS
7. Monorepo: `pnpm turbo run build` PASS
8. Referencia Nexion: `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/`
9. Adaptar de Python/FastAPI a TypeScript/NestJS manteniendo la misma lógica
10. Reemplazar "nexion" por "skuld" en nombres de campos (nexion_signatory → skuld_signatory)
11. NO inventar — si Nexion lo tiene, copiarlo. Si Nexion no lo tiene, no agregarlo.

## Fuentes Nexion

```
Endpoints:
  /nexion/nexion-one/backend/app/api/v1/contracts.py (65 endpoints)
  /nexion/nexion-one/backend/app/api/v1/admin/signing.py (23 endpoints)
  /nexion/nexion-one/backend/app/api/v1/admin/signatories.py (12 endpoints)
  /nexion/nexion-one/backend/app/api/v1/public/sign.py (13 endpoints)
  /nexion/nexion-one/backend/app/api/v1/public/contracts.py (3 endpoints)
  /nexion/nexion-one/backend/app/api/v1/contract_renewals.py (7 endpoints)
  /nexion/nexion-one/backend/app/api/v1/signed_documents.py (4 endpoints)

Modelos:
  /nexion/nexion-one/backend/app/models/contract.py (15 modelos)
  /nexion/nexion-one/backend/app/models/signing.py
  /nexion/nexion-one/backend/app/models/authorized_signatory.py
  /nexion/nexion-one/backend/app/models/signing_otp.py
  /nexion/nexion-one/backend/app/models/contract_renewal.py
  /nexion/nexion-one/backend/app/models/installation_external_contract.py

Servicios:
  /nexion/nexion-one/backend/app/services/contract_service.py (54 métodos)
  /nexion/nexion-one/backend/app/services/signing_service.py (29 métodos)
  /nexion/nexion-one/backend/app/services/contract_acceptance_service.py (7 métodos)
  /nexion/nexion-one/backend/app/services/contract_requirement_service.py (11 métodos)
  /nexion/nexion-one/backend/app/services/contract_renewal_service.py (8 métodos)
```

## Verificación final

Cuando todo esté portado:
1. `pnpm --filter @skuldbot/control-plane-api build` — 0 errores
2. `pnpm --filter @skuldbot/control-plane-api test` — 0 fallos, cobertura no decrece
3. `pnpm turbo run build` — 7/7
4. 127 endpoints en controller(s)
5. Todos los modelos de Nexion portados
6. Todos los servicios con lógica equivalente
7. Tests para cada servicio con happy paths + edge cases
