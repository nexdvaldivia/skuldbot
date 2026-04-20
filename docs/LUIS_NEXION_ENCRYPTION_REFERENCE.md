# Referencia para Luis — Lo que Nexion está haciendo en Encryption (PLN-007)

Fecha: 2026-04-19
Contexto: Nexion tiene 3 gaps de seguridad en encryption de API keys que está arreglando ahora.
Luis ya implementó parte de esto en SkuldBot. Este documento es para que conozca el contexto
completo y alinee donde sea necesario.

---

## Los 3 Gaps de Nexion (findings auditables HIPAA/SOC2/PCI)

### G-1 — Fernet con una sola master key

**Problema:** Nexion encrypta API keys con Fernet pero usa UNA SOLA master key para todos los orgs.
Si esa key se compromete (memory dump, leak de env, backup de proceso), TODO el ciphertext de
todos los orgs es recuperable.

**Estándar regulado:** Envelope encryption — data key por org/tenant wrapped por KMS/HSM master key.
Compromiso de una data key expone solo ese org.

**En SkuldBot:** Luis implementó AES-256-GCM con dual-key (PRIMARY + SECONDARY) pero es la misma
key para todos los clients. El runtime block en `environment-policy.ts` bloquea profiles regulated/strict
sin `envelope_v1`. El plan de envelope encryption está documentado en COMPLIANCE_FIRST_POLICY.md.

### G-2 — Sin key rotation policy

**Problema:** Nexion no tiene MultiFernet, no tiene migration de re-encryption, no tiene procedimiento
documentado. HIPAA 164.312(a)(2)(iv) / PCI-DSS 3.6 / SOC2 CC6.1 exigen rotación periódica.
Si la key se rota, los valores cifrados quedan inaccesibles.

**En SkuldBot:** Luis ya implementó dual-key (PRIMARY + SECONDARY) con decrypt que intenta ambas
y encrypt siempre con PRIMARY. Esto cubre rotación básica. Falta:
- Runbook documentado de rotación
- Migration de re-encryption (background job que re-encrypta todos los valores con la nueva PRIMARY)
- Expiración de SECONDARY después de ventana de gracia

### G-3 — Sin guardrail anti-regresión de escritura plana

**Problema:** En Nexion, un dev puede escribir `org.settings["nexionone_api_key"] = plain_value`
directamente y bypasear `set_nexionone_api_key()`. No hay test que lo detecte.
La seguridad actual depende de disciplina, no de enforcement.

**Lo que Nexion está haciendo (PLN-007 P0.1):**
- Test AST-based (`test_secrets_encryption_guardrail_static.py`) que rechaza:
  - Asignación directa `settings[<key>] = <plain>` para keys en lista sensible
  - Lecturas `settings.get(<sensitive_key>)` sin pasar por wrapper `get_*`
  - Nuevos usos de `cryptography.fernet.Fernet` fuera de `EncryptionService`
- Integración con Compliance Gate (nueva dimensión en test_compliance_gate.py)
- Whitelist declarada + comentario citando CLAUDE.md sección ENCRYPTION

**En SkuldBot:** Luis eliminó el fallback plaintext en el guard. Pero NO hay test que detecte si
alguien escribe `client.apiKey = plainValue` directamente en un service nuevo.
Necesitamos un guardrail similar al de Nexion.

---

## Lo que Nexion está implementando (PLN-007)

### P0.1 — Guardrail anti-regresión (1 commit)

Script/test que escanea el codebase y rechaza:
1. Asignación directa a campos sensibles sin pasar por la capa de encryption
2. Lecturas de campos sensibles sin wrapper de decrypt
3. Uso de algoritmos de encryption fuera del servicio centralizado

**Para SkuldBot:** Cuando Nexion termine P0.1, portar el patrón. Por ahora, agregar un test
simple que grepe por asignaciones directas a `apiKey` sin `encryptApiKey()`.

### P0.2 — Key rotation con MultiFernet (1 commit)

Nexion refactoriza a MultiFernet con lista ordenada de keys:
1. Primary = última rotación
2. Secondary = anterior
3. Background job re-encrypta todos los valores con primary
4. Retirar secondary después de ventana de validación

Incluye runbook operativo:
1. Generar nueva key en KMS/secret store
2. Agregar como primary (vieja queda secondary)
3. Background job re-encrypts todos los valores con primary
4. Retirar secondary después de ventana de validación
5. Test: rotar key, verificar valores viejos descifran, nuevos encriptan con primary

**En SkuldBot:** Luis ya tiene la base (dual-key). Falta:
- El background job de re-encryption
- El runbook documentado
- Test de rotación end-to-end

### P1 — Envelope encryption (post-cutover, epic aparte)

Full envelope encryption:
- Data key por tenant generada y wrapped por KMS/HSM master key
- Compromiso de una data key expone solo ese tenant
- Audit log de operaciones wrapKey/unwrapKey a KMS

**En SkuldBot:** Es el plan documentado en COMPLIANCE_FIRST_POLICY.md. Se implementa
cuando lleguemos al deploy de producción regulada. El runtime block ya existe.

---

## Go-live gates (Nexion)

| Gate | Depende de |
|------|-----------|
| PLN-005 cutover | Compliance Gate PLN-006 |
| Khipus PHI onboarding | PLN-007 P0 cerrado |
| Certificación HIPAA/SOC2 | PLN-007 P1 cerrado |

---

## Qué debe hacer Luis ahora

1. **Nada urgente** — el encryption actual (AES-256-GCM + dual-key + hash lookup + audit trail + regulated block) es correcto para el estado actual.
2. **Cuando Nexion termine P0.1** — portar el patrón de guardrail AST a SkuldBot CI.
3. **Antes de producción regulada** — implementar envelope encryption (P1) y runbook de rotación.
4. **Seguir con Users/Roles/Me** — no bloqueado por esto.
