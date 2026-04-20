# Plan: Rehacer Contratos — Portar Nexion Completo

## Context

La pagina de contratos que Albert hizo es un 10% de lo que Nexion tiene. Dubiel pidio explicitamente portar de Nexion, no inventar. El backend de Luis tiene CRUD basico (9 endpoints) pero Nexion tiene 101 endpoints, 9 modelos, 150+ metodos de servicio, y 22 componentes de UI.

Este plan documenta TODO lo que Nexion tiene y lo que SkuldBot necesita portar.

---

## NEXION vs SKULDBOT — Gap Completo

### Backend APIs

| Area | Nexion | SkuldBot hoy | Gap |
|------|:------:|:------------:|-----|
| Contract Entity CRUD | 3 endpoints | 0 en master (9 en branch) | Merge branch + extender |
| Contract Templates (versioning) | 12 endpoints | 0 | Portar completo |
| Contract Lookups (types, jurisdictions, frameworks) | 10 endpoints | 0 | Portar completo |
| Contract Acceptances | 7 endpoints | 0 | Portar completo |
| Contract Validation/Requirements | 6 endpoints | Solo gates basicos | Extender |
| Contract Rendering | 2 endpoints | PDF basico | Extender |
| Grouped/Version Views | 3 endpoints | 0 | Portar completo |
| Authorized Signatories | 9 endpoints | 0 | Portar completo |
| Signatory Policies | 8 endpoints | 0 | Portar completo |
| Signing Envelopes (admin) | 23 endpoints | 0 | Portar completo |
| Public Signing API | 13 endpoints | 0 | Portar completo |
| **Total** | **101 endpoints** | **9 (branch)** | **92 endpoints faltan** |

### Frontend

| Area | Nexion | SkuldBot hoy | Gap |
|------|:------:|:------------:|-----|
| Pages | 6 paginas | 2 (basicas) | 4 paginas + rehacer 2 |
| Components | 22 componentes | 0 | 22 componentes |
| API Client | 60+ metodos (1,001 LOC) | 9 metodos | 51+ metodos |
| TypeScript Types | 35+ tipos | ~5 | 30+ tipos |
| Total UI LOC | ~10,500 | ~900 | ~9,600 LOC |

### Modelos de Datos

| Modelo | Nexion | SkuldBot | Gap |
|--------|:------:|:--------:|-----|
| Contract (entity/metadata) | SI — con versionado, requirements, compliance | SI — basico sin versionado | Extender |
| ContractVersion (template con PDF) | SI — status workflow, PDF, signature fields | NO | Portar |
| ContractAcceptance (legal evidence) | SI — completo con snapshot, countersign | NO | Portar |
| ContractSigner | SI | SI | OK |
| ContractEvent | SI | SI | OK |
| ContractTypeLookup | SI | NO | Portar |
| ContractJurisdictionLookup | SI | NO | Portar |
| ContractComplianceFrameworkLookup | SI | NO | Portar |
| ContractSignatoryPolicy | SI | NO | Portar |
| SigningEnvelope | SI — completo con docs, recipients, events | NO | Portar |
| SigningDocument | SI | NO | Portar |
| SigningRecipient | SI | NO | Portar |
| SigningEvent | SI | NO | Portar |
| AuthorizedSignatory | SI — con firma digital | NO | Portar |

---

## Lo que Luis necesita portar (Backend)

### Fase 1: Modelos + Lookups + Templates
1. ContractTypeLookup, JurisdictionLookup, ComplianceFrameworkLookup entities
2. Lookups CRUD endpoints (10 endpoints)
3. Contract entity — extender con versionado (name, display_name, is_required, requires_signature, compliance_frameworks, etc.)
4. ContractVersion entity (reemplaza o extiende el actual)
5. Template management endpoints (create, update, publish, deprecate, archive, new-version)
6. Grouped view + version chain endpoints

### Fase 2: Acceptances + Validation
7. ContractAcceptance entity (legal evidence completa)
8. Accept, countersign, revoke, verify evidence endpoints
9. Validation endpoints (validate for subscription, vertical, addon)
10. Client contract status endpoint

### Fase 3: Signatories + Policies
11. AuthorizedSignatory entity
12. Signatory CRUD + signature upload endpoints
13. SignatoryPolicy entity
14. Policy CRUD + activate/deactivate + resolve preview

### Fase 4: Signing Envelopes
15. SigningEnvelope, SigningDocument, SigningRecipient, SigningEvent entities
16. Envelope CRUD + send + void + suspend + resume + reassign
17. Document management within envelopes
18. Delivery history + offline evidence

### Fase 5: Public Signing
19. Token-based signing page API
20. OTP verification (email + SMS)
21. Sign + decline endpoints
22. PDF preview/download for signers

### Fase 6: Variable Resolution + Rendering
23. Template variables catalog + resolve + lint
24. Signature field auto-detect + resolve
25. Contract rendering with filled variables

---

## Lo que Albert necesita portar (Frontend)

### Solo DESPUES de que el backend este listo

### Pages a portar
1. `/contracts` — Main hub con 7 tabs (625 LOC Nexion)
2. `/contracts/[name]` — Versions view (760 LOC)
3. `/contracts/templates/[id]` — Template editor con PDF (1,169 LOC)
4. `/contracts/templates/[id]/send` — Send wizard (1,283 LOC)
5. `/contracts/sent/[id]` — Envelope detail (2,446 LOC)

### Components a portar
6. ContractAcceptanceViewModal (537 LOC)
7. ContractSettingsModal (527 LOC)
8. CreateTemplateModal (436 LOC)
9. PDFContractEditor (1,874 LOC)
10. SentEnvelopesList (813 LOC)
11. SignatoryPoliciesPanel (993 LOC)
12. ContractLookupsPanel (887 LOC)
13. NexionLegalInformationPanel (261 LOC)
14. VersionChainTimeline (243 LOC)
15. TemplateVariablesEditor (392 LOC)
16. ResolutionSourceBadge (25 LOC)
17. ContractRequirementsModal (193 LOC)

### Signing Components
18. SigningPage (918 LOC)
19. DocumentViewer (235 LOC)
20. SignatureCanvas (154 LOC)
21. SignatureComposerDialog (222 LOC)
22. OTPVerification (422 LOC)
23. DeclineModal (102 LOC)
24. VariablesModal (238 LOC)

### API Client
25. contractsApi — 60+ metodos (1,001 LOC)
26. signingApi — para envelopes
27. publicSigningApi — para la pagina publica de firma
28. 35+ TypeScript interfaces

---

## Nexion Source Files Reference

### Backend
- `/nexion-one/backend/app/api/v1/contracts.py` — 65 endpoints
- `/nexion-one/backend/app/api/v1/admin/signing.py` — 23 endpoints
- `/nexion-one/backend/app/api/v1/public/sign.py` — 13 endpoints
- `/nexion-one/backend/app/models/contract.py` — 9 modelos
- `/nexion-one/backend/app/services/contract_service.py` — 85+ metodos
- `/nexion-one/backend/app/services/signing_service.py` — 65+ metodos
- `/nexion-one/backend/app/services/contract_requirement_service.py` — 35+ metodos

### Frontend
- `/nexion-one/frontend/src/app/(dashboard)/contracts/` — 6 pages
- `/nexion-one/frontend/src/components/contracts/` — 15 components
- `/nexion-one/frontend/src/components/contracts/signing/` — 7 components
- `/nexion-one/frontend/src/lib/api/contracts.ts` — API client (1,001 LOC)

---

## Verificacion

Cuando todo este portado:
1. La pagina de contratos de SkuldBot debe verse visualmente igual a la de Nexion (screenshot comparison)
2. Los 7 tabs deben funcionar con datos reales
3. El flujo completo debe funcionar: crear template → editar con PDF → enviar para firma → firmar → countersign → aceptar
4. La firma publica debe funcionar con OTP
5. Los gates deben bloquear deploy sin MSA firmado
