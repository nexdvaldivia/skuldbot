# Compliance-First Policy (Skuld, LLC)

Fecha: 2026-04-17
Estado: OBLIGATORIO — aplica a todo código, toda arquitectura, toda decisión técnica
Ámbito: SkuldBot platform completa (CP, Orchestrator, Studio, Runner, Engine, UI, Deployers)
Aprobado por: Dubiel Valdivia (Owner)

---

## Declaración

Todo código y toda decisión arquitectónica en SkuldBot DEBE ser compliance-first.
Compliance no es un gate de revisión — es la base sobre la que se construye.
No se escribe código primero y se verifica compliance después.
Se diseña para compliance primero y se implementa sobre esa base.

**Si un componente no es compliance-first desde el diseño, no se construye.**

---

## Principio fundamental

```
Compliance no es un checklist al final.
Compliance es el primer pensamiento antes de escribir la primera línea.
```

---

## Reglas no negociables

### 1. Secrets y credenciales

- Los secrets NUNCA se almacenan en plaintext. Siempre hashed (SHA-256 mínimo) o encrypted (AES-256-GCM).
- Los secrets se retornan al usuario UNA SOLA VEZ (en el momento de creación/regeneración). Después solo se muestra un prefijo truncado.
- Los secrets NUNCA aparecen en logs, responses de API (excepto la única vez), error messages, audit events, ni Evidence Pack.
- Las connection strings, API keys, tokens, passwords, y cualquier credencial se resuelven en runtime desde vault/provider. NUNCA desde .env en producción.
- Default values para secrets están PROHIBIDOS. Si un secret no está configurado, el sistema falla al iniciar (fail-fast).

### 2. Datos sensibles (PII/PHI/PCI)

- Toda operación que toque PII/PHI/PCI DEBE tener audit event.
- PII/PHI NUNCA se loguea en plaintext. Se redacta automáticamente.
- La clasificación de datos (public/internal/confidential/restricted) es obligatoria antes de procesar.
- Data minimization: solo recolectar y procesar lo estrictamente necesario.

### 3. Autenticación y autorización

- Todo endpoint DEBE tener autenticación. No hay endpoints "temporalmente" sin auth.
- Si un endpoint es público por diseño (health checks, webhook receivers, signing pages), DEBE estar documentado con comentario explícito: `// PUBLIC: <razón>`.
- Todo endpoint autenticado DEBE tener autorización granular (@RequirePermissions).
- Principio de mínimo privilegio: el permiso por defecto es DENY.
- Separación de funciones: quien desarrolla no aprueba políticas críticas.

### 4. Input validation

- Todo input del usuario se valida en el boundary (DTO con class-validator).
- SQL injection: todo query parametrizado. 0 concatenación de strings en queries.
- XSS: todo output sanitizado.
- File uploads: size limit + content type whitelist + hash verification. Sin excepción.

### 5. Audit trail

- Toda operación sensible genera un evento auditable con: who, what, when, where (IP), result.
- Las denegaciones (access denied, rate limit, validation failure) TAMBIÉN se auditan.
- El audit trail es inmutable (append-only). No se puede modificar ni borrar.
- Evidence Pack se genera automáticamente para ejecuciones de bots en perfil regulated.

### 6. Criptografía

- OTP/tokens: hashed con SHA-256 + pepper. Comparación timing-safe (timingSafeEqual).
- Passwords: Argon2id. NUNCA SHA-256 ni bcrypt para passwords de usuario.
- Encryption at rest: AES-256-GCM para datos sensibles.
- Encryption in transit: TLS 1.3 mínimo.
- Content hashes para verificación de integridad (firma de documentos, Evidence Pack).
- **Envelope encryption obligatorio para secrets por tenant**: data key por tenant/org wrapped por KMS/HSM master key. Compromiso de una data key expone solo ese tenant, no todos. Una sola master key para todo = NO compliance.
- **Key rotation policy obligatoria**: soporte para re-encryption con key nueva. Keys viejas se mantienen en ventana de gracia para decrypt, luego se migran. Sin rotation = no se despliega en perfil regulado.
- **Guardrail anti-regresión de escritura plana**: test automático en CI que detecta escritura directa de secrets sin pasar por la capa de encryption. Si un dev puede hacer `entity.apiKey = plainValue` y bypassear el encrypt, el guardrail no existe. La seguridad depende de enforcement, no de disciplina.

#### Lección de Nexion (G-1, G-2, G-3)

Nexion usa Fernet encryption para API keys — no es plaintext. Pero tiene 3 gaps que son findings auditables en HIPAA/SOC2/PCI:
- G-1: Una sola master key para todos los orgs (compromiso = todo expuesto)
- G-2: Sin key rotation (HIPAA 164.312(a)(2)(iv), PCI-DSS 3.6, SOC2 CC6.1)
- G-3: Sin guardrail anti-regresión (dev puede escribir plain y bypassear encrypt)

SkuldBot NO hereda estos gaps. Se construye con envelope encryption, rotation, y enforcement desde día 1.

### 7. Estado y transiciones

- Las máquinas de estado (envelope status, contract status, subscription lifecycle) DEBEN validar transiciones. No se puede saltar estados ni repetir transiciones inválidas.
- Toda transición de estado genera audit event.

### 8. Rate limiting

- Todo endpoint público DEBE tener rate limiting.
- OTP: max attempts antes de lockout. Max requests por hora por recipient.
- API: rate limiting por tenant/API key.
- Sin rate limiting = no se despliega.

### 9. Enums y configuración

- Valores que un admin puede cambiar sin deploy → lookup table con CRUD + FK (Nexion ADR-001).
- Enums TypeScript solo para constantes que NUNCA cambian sin deploy.
- Configuración crítica (DB, JWT, secrets) sin fallback silencioso. Fail-fast si falta.

### 10. Multi-cloud y soberanía de datos

- 0 acoplamiento directo a un cloud específico en la capa de negocio.
- Servicios de negocio consumen interfaces/providers. Cambiar cloud = cambiar configuración.
- Los datos del cliente NUNCA transitan por infraestructura de Skuld sin consentimiento explícito.
- Data residency configurable por tenant.

---

## Cuándo aplica

| Momento | Qué hacer |
|---------|-----------|
| **Antes de diseñar** | Preguntarse: "¿Cómo afecta esto a compliance?" Si no tiene respuesta, no empezar |
| **Antes de codificar** | Verificar que el diseño cumple las 10 reglas. Si no cumple, rediseñar |
| **Durante code review** | Cada regla es un check. Un fallo = REJECT |
| **Antes de merge** | QG8 del Quality Gate System debe PASS con evidencia |
| **Antes de deploy** | Verificación final de compliance por perfil (standard/regulated/strict) |

---

## Violaciones

Una violación de esta política es:

- Secret en plaintext en DB, logs, o response
- Endpoint sin autenticación sin documentación de por qué es público
- Operación sensible sin audit event
- Input sin validación en el boundary
- File upload sin size limit o content type validation
- OTP/token sin hashing
- Transición de estado sin validación
- Endpoint público sin rate limiting
- Enum hardcodeado que debería ser lookup table
- Acoplamiento directo a un cloud en capa de negocio

**Toda violación es defecto bloqueante. No hay excepciones, no hay "después lo arreglamos".**

---

## Relación con otros documentos

| Documento | Relación |
|-----------|----------|
| `CLAUDE.md` | Esta política refuerza y extiende los principios de seguridad de CLAUDE.md |
| `REGULATORY_DESIGN_GUARDRAILS.md` | Esta política es la implementación dura de los guardrails |
| `QUALITY_GATE_CHECKLIST.md` | QG5 (Security) y QG8 (Compliance) ejecutan los checks de esta política |
| `WORK_PROTOCOL.md` | Esta política es prerequisito de toda tarea — se aplica ANTES del handshake |
| `NEXION_PLN005_LESSONS_FOR_SKULD.md` | Las lecciones de PLN-005 son ejemplos de lo que pasa cuando no se aplica compliance-first |

---

## Para el equipo

```
No preguntes "¿Esto pasa compliance?"
Pregunta "¿Diseñé esto PARA compliance?"

La diferencia: uno espera a que le digan que está mal.
El otro no produce código que pueda estar mal.
```

---

## Versionado

| Versión | Fecha | Cambio |
|:-------:|-------|--------|
| 1.0 | 2026-04-17 | Creación — política dura de compliance-first |
