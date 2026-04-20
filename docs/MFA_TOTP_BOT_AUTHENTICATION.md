# MFA/TOTP Bot Authentication — Especificación Técnica Completa

Fecha: 2026-04-19
Estado: APROBADO — implementar ya
Prioridad: ALTA — resuelve limitación real encontrada en cliente con ElectroNeek
Ámbito: Engine (nodo), Studio (KeyVault local), Orchestrator (KeyVault producción), Runner (ejecución)

---

## 1. El Problema

Los bots de RPA se traban cuando el sistema destino tiene MFA (autenticación multifactor).
El bot pone usuario y password, pero cuando el sistema pide el código de 6 dígitos que cambia
cada 30 segundos, el bot no puede continuar.

Esto afecta a cualquier sistema enterprise con MFA habilitado: SAP, Salesforce, portales
bancarios, sistemas de salud, ERPs, CRMs.

**Experiencia real:** Un cliente con ElectroNeek no podía automatizar procesos porque el
sistema destino tenía MFA obligatorio. ElectroNeek no resuelve esto automáticamente.

---

## 2. La Solución

### 2.1 Qué es TOTP

TOTP (Time-based One-Time Password, RFC 6238) es el estándar que usan Google Authenticator,
Microsoft Authenticator, y la mayoría de apps de MFA.

**Cómo funciona:**
1. Al configurar MFA, el sistema te muestra un QR code
2. Ese QR contiene un "shared secret" (texto largo, ej: `JBSWY3DPEHPK3PXP`)
3. Tu teléfono toma ese secret + la hora actual → operación matemática → código de 6 dígitos
4. Cada 30 segundos la hora cambia → el código cambia
5. El servidor del sistema hace la misma matemática → si coincide, entra

**Punto clave:** No se manda nada por internet. No es SMS. El teléfono y el servidor
generan el mismo número independientemente porque ambos tienen el shared secret.

### 2.2 Qué hace el bot

En vez del teléfono, el bot hace la misma operación:

```
Bot llega a login
  ↓
Pone usuario + password (cerradura 1)
  ↓
Sistema pide código de 6 dígitos (cerradura 2)
  ↓
Bot pide shared secret al KeyVault por nombre: ${vault.erp-sap-mfa-secret}
  ↓
KeyVault decripta y entrega el secret en memoria efímera
  ↓
Bot calcula TOTP: shared_secret + hora_actual = 847293
  ↓
Bot llena el campo con 847293
  ↓
Entra ✅
  ↓
Secret descartado de memoria (nunca persiste)
```

---

## 3. Arquitectura — KeyVault Dual Environment

### 3.1 El principio

El shared secret se guarda por NOMBRE en el KeyVault. El mismo nombre existe en dos entornos
con valores diferentes. El bot no cambia — lo que cambia es dónde se resuelve.

```
┌───────────────────────────────────────────────────┐
│  STUDIO (desarrollo / debug local)                │
│                                                    │
│  KeyVault Local (AES-256-GCM, encrypted env)      │
│  ┌──────────────────────────────────────────┐     │
│  │ "erp-sap-mfa-secret" → valor de PRUEBA   │     │
│  │ "crm-salesforce-mfa" → valor de PRUEBA   │     │
│  └──────────────────────────────────────────┘     │
│                                                    │
│  Bot en debug:                                    │
│  ${vault.erp-sap-mfa-secret} → resuelve LOCAL    │
└───────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────┐
│  ORCHESTRATOR (producción, infra del cliente)     │
│                                                    │
│  KeyVault Real (Azure KV / AWS SM / HashiCorp)    │
│  ┌──────────────────────────────────────────┐     │
│  │ "erp-sap-mfa-secret" → valor REAL prod   │     │
│  │ "crm-salesforce-mfa" → valor REAL prod   │     │
│  └──────────────────────────────────────────┘     │
│                                                    │
│  Bot en producción:                               │
│  ${vault.erp-sap-mfa-secret} → resuelve en PROD  │
└───────────────────────────────────────────────────┘
```

### 3.2 El .skb (Bot Package) — lo que viaja

```json
{
  "nodes": [
    {
      "id": "node-mfa",
      "type": "auth.totp_generate",
      "config": {
        "secretRef": "${vault.erp-sap-mfa-secret}",
        "digits": 6,
        "period": 30,
        "algorithm": "SHA1"
      }
    }
  ]
}
```

El .skb tiene SOLO la referencia `${vault.erp-sap-mfa-secret}`.
NUNCA el valor del secret. NUNCA.

### 3.3 Múltiples bots, un solo secret

```
Orchestrator del Cliente
└── KeyVault
    ├── erp-sap-mfa-secret          → "JBSWY3DPEHPK3PXP"
    ├── crm-salesforce-mfa-secret   → "KRSXG5CTMVRXEZLU"
    ├── portal-banco-mfa-secret     → "MFZWIZLOOQ2HGZLT"
    └── sistema-salud-mfa-secret    → "NFXHI3DFPBQXI33O"

Bot 1 (Facturación)     → SAP     → ${vault.erp-sap-mfa-secret}
Bot 2 (Reconciliación)  → SAP     → ${vault.erp-sap-mfa-secret}     ← mismo secret
Bot 3 (Claims)          → CRM     → ${vault.crm-salesforce-mfa-secret}
Bot 4 (Compliance)      → Banco   → ${vault.portal-banco-mfa-secret}
Bot 5 (FNOL)            → Salud   → ${vault.sistema-salud-mfa-secret}
```

Un solo secret por sistema destino. Muchos bots lo consumen.
Si el sistema rota el MFA, el admin actualiza UN secret y todos los bots siguen funcionando.

---

## 4. Governance y Seguridad

### 4.1 Policies por bot

No todos los bots pueden pedir cualquier secret. El KeyVault tiene policies de acceso:

```
Bot "Facturación":
  - ALLOW: erp-sap-mfa-secret, erp-sap-password
  - DENY: portal-banco-mfa-secret, sistema-salud-mfa-secret

Bot "Claims FNOL":
  - ALLOW: sistema-salud-mfa-secret
  - DENY: erp-sap-mfa-secret, portal-banco-mfa-secret
```

Si un bot intenta acceder a un secret que no tiene permitido → DENY + audit event.

### 4.2 Audit trail

Cada acceso a un MFA secret genera un evento auditable:

```json
{
  "event": "vault.secret_accessed",
  "secretName": "erp-sap-mfa-secret",
  "botId": "bot-facturacion-001",
  "executionId": "exec-uuid",
  "timestamp": "2026-04-19T10:30:00.000Z",
  "result": "GRANTED",
  "ipAddress": "10.0.1.50",
  "runnerId": "runner-prod-01"
}
```

### 4.3 El secret NUNCA aparece en

- El .skb (bot package) — solo referencia por nombre
- Los logs del bot — redactado automáticamente
- El Evidence Pack — registra que se usó el secret, no el valor
- Las responses de API — nunca
- El canvas del Studio — solo muestra el nombre, no el valor

### 4.4 Rotación de MFA secret

Cuando el sistema destino rota su MFA (ej: SAP regenera el shared secret):

1. Admin escanea el nuevo QR del sistema destino
2. Extrae el nuevo shared secret
3. Actualiza en el KeyVault del Orchestrator: `erp-sap-mfa-secret = nuevo_valor`
4. Todos los bots que usan ese secret siguen funcionando automáticamente
5. No hay que tocar ningún bot, ningún .skb, ningún workflow

---

## 5. Implementación Técnica

### 5.1 Nodo: `auth.totp_generate`

**Ubicación en Engine:** `engine/skuldbot/nodes/auth/totp_generate.py`

**Categoría:** `auth` (autenticación)

**Inputs:**
| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| secretRef | string | Sí | Referencia al vault: `${vault.nombre-del-secret}` |
| digits | integer | No | Cantidad de dígitos (default: 6) |
| period | integer | No | Período en segundos (default: 30) |
| algorithm | string | No | Algoritmo hash (default: SHA1, opciones: SHA1, SHA256, SHA512) |

**Outputs:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| code | string | El código TOTP generado (ej: "847293") |
| expiresIn | integer | Segundos hasta que expire este código |
| generatedAt | string | Timestamp ISO de generación |

**Salidas del nodo:**
- `success` → código generado correctamente
- `error` → secret no encontrado, vault inaccesible, secret inválido

### 5.2 Implementación Python (Engine)

SkuldBot ya tiene `rpaframework` como dependencia del engine. La librería `RPA.MFA` incluye
pyotp integrado para generación de TOTP. NO reimplementamos la matemática — la wrappeamos.

```python
# engine/skuldbot/nodes/auth/totp_generate.py

import time
from RPA.MFA import MFA


def generate_totp(
    secret: str,
    digits: int = 6,
    period: int = 30,
) -> dict:
    """
    Genera un código TOTP usando RPA.MFA (pyotp wrapper de rpaframework).

    Args:
        secret: El shared secret en base32 (como viene del QR)
        digits: Cantidad de dígitos del código (default 6)
        period: Período de validez en segundos (default 30)

    Returns:
        dict con code, expiresIn, generatedAt
    """
    mfa = MFA()
    mfa.use_totp(secret, digits=digits, interval=period)
    code = mfa.get_otp()

    now = int(time.time())
    expires_in = period - (now % period)

    return {
        "code": code,
        "expiresIn": expires_in,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(now)),
    }
```

**Nota:** `RPA.MFA` ya está disponible en el engine porque `rpaframework` es dependencia
del BotRunner. No se agrega ninguna dependencia nueva.

### 5.3 Integración con el KeyVault (Runtime)

```python
# En el executor del bot, cuando encuentra un nodo auth.totp_generate:

async def execute_totp_generate(node_config, vault_client):
    """
    1. Resuelve el secret desde el KeyVault
    2. Genera el TOTP
    3. Devuelve el código
    4. Descarta el secret de memoria
    """
    secret_ref = node_config["secretRef"]  # "${vault.erp-sap-mfa-secret}"
    secret_name = secret_ref.replace("${vault.", "").rstrip("}")

    # 1. Pedir al KeyVault (memory efímera)
    secret_value = await vault_client.get_secret(secret_name)

    if not secret_value:
        raise NodeExecutionError(
            code="AUTH_MFA_SECRET_NOT_FOUND",
            message=f"MFA secret '{secret_name}' not found in KeyVault",
            retryable=False,
        )

    # 2. Generar TOTP
    try:
        result = generate_totp(
            secret=secret_value,
            digits=node_config.get("digits", 6),
            period=node_config.get("period", 30),
            algorithm=node_config.get("algorithm", "SHA1"),
        )
    finally:
        # 3. Descartar secret de memoria (overwrite)
        secret_value = None
        del secret_value

    return result
```

### 5.4 Integración con el Studio (Visual)

En el Studio, el nodo `auth.totp_generate` se muestra como:

```
┌─────────────────────────┐
│  🔐 TOTP Generate       │
│                          │
│  Secret: vault.sap-mfa  │
│  Digits: 6              │
│  Period: 30s             │
├─────────────────────────┤
│  ● success → [Fill MFA] │
│  ● error → [Handle Err] │
└─────────────────────────┘
```

El campo "Secret" es un selector que muestra los secretos disponibles en el KeyVault
del Studio. El usuario selecciona el nombre — nunca ve el valor.

### 5.5 Registro en Node Registry

```python
# engine/skuldbot/nodes/registry.py

"auth.totp_generate": {
    "category": "auth",
    "name": "TOTP Generate",
    "description": "Generates a TOTP code for MFA authentication using a shared secret from KeyVault",
    "inputs": {
        "secretRef": {"type": "vault_ref", "required": True},
        "digits": {"type": "integer", "default": 6},
        "period": {"type": "integer", "default": 30},
        "algorithm": {"type": "string", "default": "SHA1", "options": ["SHA1", "SHA256", "SHA512"]},
    },
    "outputs": {
        "code": {"type": "string"},
        "expiresIn": {"type": "integer"},
        "generatedAt": {"type": "string"},
    },
    "needsVaultConnection": True,
}
```

### 5.6 Template en Compiler

```jinja2
{# Macro para auth.totp_generate #}
{% macro totp_generate(node) %}
    ${totp_result}=    Generate TOTP
    ...    secret_ref={{ node.config.secretRef }}
    ...    digits={{ node.config.digits | default(6) }}
    ...    period={{ node.config.period | default(30) }}
    ...    algorithm={{ node.config.algorithm | default('SHA1') }}
    Set Node Variable    {{ node.id }}    output    ${totp_result}
{% endmacro %}
```

---

## 6. Flujo de Configuración (paso a paso)

### 6.1 Setup inicial (una sola vez por sistema destino)

```
PASO 1: Admin del cliente va al sistema destino (ej: SAP)
        → Crea una service account para el bot (ej: bot-skuld-facturacion@company.com)
        → Habilita MFA con TOTP para esa cuenta

PASO 2: SAP muestra un QR code para configurar el Authenticator
        → En vez de escanearlo con el teléfono, el admin extrae el shared secret del QR
        → El shared secret es un texto como: JBSWY3DPEHPK3PXP

PASO 3: Admin va al Orchestrator de Skuld → KeyVault → Nuevo Secret
        → Nombre: erp-sap-mfa-secret
        → Valor: JBSWY3DPEHPK3PXP
        → Tipo: TOTP Shared Secret
        → Guardar (se encrypta automáticamente)

PASO 4: Admin verifica que funciona
        → En el Studio, arrastra un nodo "TOTP Generate"
        → Selecciona "erp-sap-mfa-secret" como secretRef
        → Debug → genera un código → lo verifica manualmente en SAP → funciona ✅
```

### 6.2 Uso en un workflow (cada vez que se ejecuta)

```
[Manual Trigger]
       │
       ▼
[Open Browser] → url: https://sap.company.com/login
       │
       ▼
[Fill Field] → selector: #username → value: ${vault.erp-sap-username}
       │
       ▼
[Fill Field] → selector: #password → value: ${vault.erp-sap-password}
       │
       ▼
[Click] → selector: #login-button
       │
       ▼
[Wait Element] → selector: #mfa-code-input    ← SAP pide el código MFA
       │
       ▼
[TOTP Generate] → secretRef: ${vault.erp-sap-mfa-secret}    ← genera 847293
       │
       ▼
[Fill Field] → selector: #mfa-code-input → value: ${TOTP Generate.code}
       │
       ▼
[Click] → selector: #verify-button
       │
       ▼
[Wait Element] → selector: #dashboard    ← SAP dashboard carga ✅
       │
       ▼
[... resto del workflow ...]
```

---

## 7. Tipos de MFA soportados

| Tipo | Automatizable | Cómo lo resuelve SkuldBot | Nodo |
|------|:------------:|--------------------------|------|
| **TOTP (Authenticator)** | ✅ Sí | Bot genera código con shared secret del KeyVault | `auth.totp_generate` |
| **SMS OTP** | ⚠️ Parcial | Bot lee SMS via provider (Twilio) o lee email con código | `auth.sms_otp_read` (futuro) |
| **Email OTP** | ⚠️ Parcial | Bot lee email con código via IMAP/Graph API | `auth.email_otp_read` (futuro) |
| **Push notification** | ❌ No | Requiere aprobación humana en dispositivo | No automatizable |
| **Hardware token (YubiKey)** | ❌ No | Requiere dispositivo físico | No automatizable |
| **Certificate auth** | ✅ Sí | Bot usa certificado del KeyVault | `auth.certificate` (futuro) |
| **OAuth + refresh token** | ✅ Sí | Bot renueva token sin MFA | Ya existe en nodos de API |

### Prioridad de implementación

1. **auth.totp_generate** — AHORA (resuelve el caso más común)
2. **auth.email_otp_read** — Después (usa nodos de email existentes)
3. **auth.sms_otp_read** — Después (usa provider SMS existente)
4. **auth.certificate** — Futuro (para mTLS y certificate-based auth)

---

## 8. Seguridad — Reglas no negociables

1. **El shared secret NUNCA sale del KeyVault en texto persistente.**
   Se resuelve en memoria efímera, se usa, se descarta.

2. **El shared secret NUNCA aparece en:**
   - El .skb (bot package)
   - Los logs del bot
   - El Evidence Pack (solo registra que se usó, no el valor)
   - Las responses de API
   - El canvas del Studio (solo muestra el nombre)
   - Las variables del workflow

3. **Acceso controlado por policy del KeyVault.**
   Cada bot tiene una lista de secrets permitidos. Acceso no autorizado = DENY + audit event.

4. **Audit trail obligatorio.**
   Cada acceso genera evento: botId, secretName, timestamp, result (GRANTED/DENIED), runnerId.

5. **El código TOTP generado se trata como dato sensible.**
   Se redacta en logs. En el Evidence Pack aparece como `[TOTP_CODE_REDACTED]`.

6. **Rotación transparente.**
   Si el sistema destino rota el MFA, solo se actualiza el secret en el KeyVault.
   No se toca ningún bot, ningún .skb, ningún workflow.

---

## 9. Ventaja competitiva

| Competidor | ¿Genera TOTP? | Cómo | Nativo? | Vault + Governance? |
|-----------|:------------:|------|:-------:|:-------------------:|
| **UiPath** | Sí | Plugin de marketplace (TwoStepAuthentication.Activities) | No — terceros | Credential Vault básico, sin policies por bot |
| **Automation Anywhere** | Sí | Paquete en Bot Store (Two-Factor Authentication Package) | No — descargable | Credential Vault, sin governance granular |
| **ElectroNeek** | No nativo | Usuarios preguntan en foro cómo bypasear MFA. Depende de rpaframework | No | Tiene vault pero no genera TOTP |
| **Power Automate** | No nativo | Workaround community con Python + pyotp. Microsoft dice oficialmente que "MFA no se puede automatizar" | No — hack | Certificate-based auth como alternativa oficial |
| **rpaframework** | Sí | Librería RPA.MFA con pyotp integrado | Sí — open source | Sin vault ni governance |
| **n8n** | No | No tiene nodo TOTP ni vault | No | No |
| **SkuldBot** | **Sí** | **Nodo nativo `auth.totp_generate` en el Engine** | **Sí — first-class** | **KeyVault con encryption + policies por bot + audit trail + dual environment** |

**Diferenciador real:** No es que generemos TOTP — UiPath y AA también lo hacen con plugins.
Nuestro diferenciador es la **integración completa nativa**:
- TOTP como nodo first-class del Engine, no plugin de terceros
- Secret en KeyVault con AES-256-GCM encryption + policies de acceso por bot
- Audit trail de cada acceso al MFA secret (quién, cuándo, desde dónde)
- Dual environment: mismo nombre en Studio (dev) y Orchestrator (prod)
- Governance enterprise: el admin controla qué bot accede a qué MFA secret
- Rotación transparente: actualizar un secret y todos los bots siguen funcionando

Ningún competidor tiene la combinación completa de TOTP nativo + vault encrypted +
governance por bot + audit trail + dual environment en un solo producto.

---

## 10. Infraestructura existente (YA IMPLEMENTADO)

El sistema de vault de SkuldBot YA tiene la mayor parte de la infraestructura necesaria:

| Componente | Estado | Ubicación |
|-----------|:------:|-----------|
| Local Vault (AES-256-GCM, PBKDF2) | ✅ LISTO | `engine/skuldbot/libs/local_vault.py` |
| Multi-provider vault (7 providers) | ✅ LISTO | `engine/skuldbot/libs/vault.py` |
| Fallback chain (LOCAL→ORCH→AWS→AZURE→HC→ENV→DOTENV) | ✅ LISTO | `engine/skuldbot/libs/vault.py` |
| Robot Framework keywords (Get/Set/Delete Secret) | ✅ LISTO | `engine/skuldbot/libs/vault.py` |
| DSL credential type (`${vault.xxx}`) | ✅ LISTO | `engine/skuldbot/dsl/models.py` |
| Compiler excluye credentials del .skb | ✅ LISTO | `engine/skuldbot/compiler/compiler.py` |
| SecretValue wrapper (redacta en logs) | ✅ LISTO | `engine/skuldbot/libs/vault.py` |
| EnvPanel UI (3 ambientes) | ✅ LISTO | `studio/src/components/EnvPanel.tsx` |
| Audit logging (HIPAA §164.312) | ✅ LISTO | `engine/skuldbot/libs/local_vault.py` |
| RPA.MFA (pyotp wrapper) | ✅ LISTO | Dependencia de rpaframework |
| **Nodo auth.totp_generate** | ❌ FALTA | Implementar — este documento lo especifica |
| **Registro en node registry** | ❌ FALTA | `engine/skuldbot/nodes/registry.py` |
| **Template en compiler** | ❌ FALTA | `engine/skuldbot/compiler/templates/` |
| **Nodo visual en Studio** | ❌ FALTA | `studio/src/data/nodeTemplates.ts` |

**Lo que hay que hacer:** crear el nodo TOTP que conecte `RPA.MFA` con el vault existente.
La infraestructura de vault, encryption, multi-provider, dual environment, y audit ya existe.

Referencia completa de la infraestructura de vault: `docs/VAULT_SECRETS.md`

---

## 11. Relación con otros documentos

| Documento | Relación |
|-----------|----------|
| `docs/VAULT_SECRETS.md` | Infraestructura completa de vault — multi-provider, fallback chain, keywords, compliance |
| `CLAUDE.md` | `${vault.api_key}` — mismo patrón de vault reference |
| `COMPLIANCE_FIRST_POLICY.md` | Secrets en vault, audit trail, encryption at rest |
| `VERTICAL_WORKERS_ARCHITECTURE.md` | KeyVault como mecanismo de control de IP |
| `skuld_architecture_strategy_final.pdf` | KeyVault Node — Secret Manager, Access Control, Audit |
| `QUALITY_GATE_CHECKLIST.md` | QG5.8 (insecure defaults), QG8.5 (audit events) |

---

## 11. Definición de Done

Esta feature se considera completa cuando:

- [ ] Nodo `auth.totp_generate` implementado en Engine con tests
- [ ] Nodo registrado en registry.py con todas las propiedades
- [ ] Template de compiler genera código correcto
- [ ] Nodo visible en Studio con selector de vault secrets
- [ ] Debug en Studio funciona con KeyVault local
- [ ] Runner en producción funciona con KeyVault del Orchestrator
- [ ] Policies de acceso por bot implementadas
- [ ] Audit trail de accesos implementado
- [ ] Secret redactado en logs y Evidence Pack
- [ ] Documentación del nodo en docs.skuldbot.com
- [ ] Test end-to-end: bot entra a sistema con MFA habilitado

---

## Versionado

| Versión | Fecha | Cambio |
|:-------:|-------|--------|
| 1.0 | 2026-04-19 | Especificación completa — implementar ya |
