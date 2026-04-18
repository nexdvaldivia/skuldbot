# Compliance First Policy

## 1. Objective

SkuldBot must be deployable in regulated industries (HIPAA/SOC2 equivalents) without security retrofits.

## 2. Mandatory Secret Rules

- No plaintext secrets at rest.
- No placeholder secrets outside local/test.
- Secrets injected by vault/platform; `.env` is dev-only.
- All credential mutations must write immutable audit events.

## 3. Client API Key Encryption

### Current State (Temporary)

- API keys are encrypted at rest with AES-256-GCM.
- Lookup uses `api_key_hash` (SHA-256) and no plaintext fallback in guards.
- Dual-key decryption support is enabled:
  - `CLIENT_API_KEY_ENCRYPTION_KEY_PRIMARY`
  - `CLIENT_API_KEY_ENCRYPTION_KEY_SECONDARY`

### Known Gap

- Envelope encryption per tenant/data-domain is not yet implemented.

### Regulatory Deploy Gate

- For `COMPLIANCE_PROFILE=regulated|strict`, runtime enforces:
  - `CLIENT_API_KEY_ENCRYPTION_MODE=envelope_v1`
- If not satisfied, application startup fails closed.

## 4. Remediation Plan (Envelope Encryption)

### Phase A (Current)

- Remove plaintext fallback from runtime auth.
- Backfill existing keys to encrypted+hashed format.
- Add immutable audit trail for API key rotation.

### Phase B (Next)

- Introduce envelope encryption with per-tenant data keys.
- Key wrapping/unwrapping through KMS/KeyVault provider abstraction.
- Scheduled re-encryption job with key versioning.

### Phase C (Production Regulated Readiness)

- Enable `CLIENT_API_KEY_ENCRYPTION_MODE=envelope_v1` in regulated deployments.
- Prove key rotation drills and audit evidence in CI/CD compliance checks.

## 5. Non-Negotiable

No regulated deployment is allowed while client API keys remain in `single_key` mode.
