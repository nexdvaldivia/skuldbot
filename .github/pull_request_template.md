## Summary

- What changed:
- Why:

## Work Protocol ACK (required)
- Task ID / Branch:
- In scope (files/modules):
- Out of scope (explicitly excluded):
- Gates aplicables (QG1..QG9):
- Riesgos y mitigacion:

## Quality Gates (QG1-QG9)
- QG1 Build: `pass`
- QG2 Tests: `pass`
- QG3 Contracts/E2E: `pass`
- QG4 Lint + Typecheck: `pass`
- QG5 Security Baseline: `pass`
- QG6 CI Smoke: `pass`
- QG7 Review + DoD: `pass`
- QG8 Compliance Check: `pass`
- QG9 Nexion Parity (migrations): `pass`

## Quality Gate Justification (required)
- QG1 evidence:
- QG2 evidence:
- QG3 evidence:
- QG4 evidence:
- QG5 evidence:
- QG6 evidence:
- QG7 evidence:
- QG8 evidence:
- QG9 evidence:

## Regulatory Profile (choose exactly one)

- [ ] `standard`
- [ ] `regulated`
- [ ] `strict`

## Data Sensitivity Impact (select all that apply)

- [ ] `none`
- [ ] `PII`
- [ ] `PHI`
- [ ] `PCI`
- [ ] `legal_hold`

## Mandatory Regulatory Checklist

- [ ] I confirm access control changes (if any) are covered by tests, including negative authorization tests.
- [ ] I confirm no secrets or premium prompts are logged or persisted in plaintext.
- [ ] I confirm telemetry/logs are data-minimized and do not exfiltrate raw sensitive data by default.
- [ ] I confirm evidence/audit impact was reviewed and updated where required.
- [ ] I confirm no runtime mock/fake/stub placeholders were introduced; incomplete integrations fail-fast.
- [ ] I confirm this change follows `docs/REGULATORY_DESIGN_GUARDRAILS.md`.

## Mandatory Architecture/Platform Checklist
- [ ] I confirm Nexion-first reuse was applied: existing Nexion implementation was reused/adapted whenever compatible with Skuld.
- [ ] I confirm business services use abstraction/providers (no direct cloud coupling).
- [ ] I confirm multi-cloud compatibility is preserved (AWS/Azure/GCP/on-prem via providers).
- [ ] I confirm secrets are sourced via vault/key vault/provider and `.env` is local-only minimal non-sensitive.
- [ ] I confirm marketing/web does not expose direct Control Plane URLs and uses gateway-only integration.

## Mandatory UI/Branding Gate (if UI touched)

- [ ] UI not impacted in this PR.
- [ ] If UI is impacted: I confirm the implementation uses `shadcn/ui` + `Tailwind CSS`.
- [ ] If UI is impacted: I confirm Refactoring UI principles were followed end-to-end.
- [ ] If UI is impacted: I confirm Skuld brand rules were respected (corporate colors/tokens + official SkuldBot logo only).
- [ ] If UI is impacted: I confirm `Montserrat` is used as the UI typography standard.
- [ ] If UI is impacted: I confirm reusable patterns were componentized and existing components were reused (no duplicated UI implementation).
- [ ] If UI is impacted: I confirm enterprise go-to-market quality (responsive, accessibility basics, complete states, no placeholders in critical flows).
- [ ] If UI is impacted: I confirm user feedback/messaging uses toast components (no browser native `alert`, `confirm`, `prompt`).
- [ ] I confirm this change follows `docs/ENTERPRISE_UI_BRANDING_NON_NEGOTIABLES.md`.

## Documentation Sync (choose exactly one)

- [ ] Docs updated in this PR (node/platform/API behavior).
- [ ] Docs N/A for this PR (no behavior/contract impact).

## Evidence and Validation

- Tests executed:
- Evidence artifacts updated (if applicable):
- Monitoring/alerts impact:

## Risk and Exceptions

- Risk level: `low|medium|high`
- Exception requested? `yes|no`
- If yes, link the approved exception ticket with mitigation and expiry:
