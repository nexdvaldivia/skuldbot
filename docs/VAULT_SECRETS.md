# Sistema de Vault y Secrets - SkuldBot

Este documento describe la arquitectura completa de gestión de secretos, credenciales y encriptación en SkuldBot.

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────┐
│                          STUDIO (UI)                                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │  EnvPanel.tsx   │    │ nodeTemplates.ts│    │  flowStore.ts  │  │
│  │  - Development  │    │ - security.*    │    │ - Variables    │  │
│  │  - Staging      │    │   nodes         │    │ - Credentials  │  │
│  │  - Production   │    │                 │    │                │  │
│  └────────┬────────┘    └────────┬────────┘    └───────┬────────┘  │
│           │                      │                     │           │
│           └──────────────────────┼─────────────────────┘           │
│                                  ▼                                 │
│                        DSL JSON (bot.json)                         │
│                   credential refs, NO values                       │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         COMPILER                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  compiler.py                                                  │  │
│  │  - Detecta credentials: _has_credentials()                   │  │
│  │  - Excluye valores de credentials del Bot Package            │  │
│  │  - Genera manifest.json con requires_credentials: true       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BOT PACKAGE (.zip)                               │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │  manifest.json                                                 ││
│  │  {                                                             ││
│  │    "requires_credentials": true,                               ││
│  │    "credential_refs": ["api_key", "db_password"]              ││
│  │  }                                                             ││
│  │                                                                ││
│  │  variables/config.yaml (SIN valores de credentials)           ││
│  │  main.robot + resources/                                      ││
│  └────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       RUNTIME (Runner)                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  SkuldVault Library                                          │  │
│  │                                                               │  │
│  │  Robot Framework Keywords:                                    │  │
│  │  - Get Secret                                                 │  │
│  │  - Set Secret                                                 │  │
│  │  - Delete Secret                                              │  │
│  │  - List Secrets                                               │  │
│  │  - Hash Secret                                                │  │
│  │  - Mask Secret In String                                      │  │
│  └──────────────────────────────────┬───────────────────────────┘  │
│                                     │                              │
│                                     ▼                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │           VAULT PROVIDERS (Fallback Chain)                   │  │
│  │                                                               │  │
│  │  1. Specified Provider ──┐                                   │  │
│  │                          ▼                                   │  │
│  │  ┌───────────────────────────────────────────────────────┐  │  │
│  │  │  LOCAL   │  ORCHESTRATOR  │  AWS  │  AZURE  │ HASHICORP│  │  │
│  │  │  Vault   │     Vault      │  SM   │   KV    │  Vault   │  │  │
│  │  │(AES-256) │                │       │         │          │  │  │
│  │  └───────────────────────────────────────────────────────┘  │  │
│  │                          │                                   │  │
│  │  2. Fallback to LOCAL ───┘                                   │  │
│  │                          ▼                                   │  │
│  │  ┌───────────────────────────────────────────────────────┐  │  │
│  │  │  Local Vault (.skuldbot/vault.enc)                    │  │  │
│  │  └───────────────────────────────────────────────────────┘  │  │
│  │                          │                                   │  │
│  │  3. Fallback to ENV ─────┘                                   │  │
│  │                          ▼                                   │  │
│  │  ┌───────────────────────────────────────────────────────┐  │  │
│  │  │  Environment Variables (os.environ)                   │  │  │
│  │  └───────────────────────────────────────────────────────┘  │  │
│  │                          │                                   │  │
│  │  4. Fallback to DOTENV ──┘                                   │  │
│  │                          ▼                                   │  │
│  │  ┌───────────────────────────────────────────────────────┐  │  │
│  │  │  .env File (python-dotenv)                            │  │  │
│  │  └───────────────────────────────────────────────────────┘  │  │
│  │                          │                                   │  │
│  │  5. Default Value ───────┘                                   │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Proveedores de Vault Soportados

| Provider | Descripción | Dependencias | Configuración | Compliance |
|----------|-------------|--------------|---------------|------------|
| `ENV` | Variables de entorno | Ninguna | `os.environ` | - |
| `DOTENV` | Archivo `.env` | Ninguna | Archivo `.env` en directorio | - |
| `LOCAL` | **Vault local encriptado** | `cryptography` | `SKULDBOT_VAULT_PASSWORD` | HIPAA, PCI-DSS |
| `ORCHESTRATOR` | API del Orchestrator | Ninguna | `SKULDBOT_ORCHESTRATOR_URL`, `SKULDBOT_ORCHESTRATOR_TOKEN` | HIPAA, SOX |
| `AWS` | AWS Secrets Manager | `boto3` | AWS credentials configuradas | HIPAA, SOC2 |
| `AZURE` | Azure Key Vault | `azure-identity`, `azure-keyvault-secrets` | `AZURE_KEYVAULT_URL` | HIPAA, SOC2 |
| `HASHICORP` | HashiCorp Vault | `hvac` | `VAULT_ADDR`, `VAULT_TOKEN` | HIPAA, PCI-DSS |

### Instalación de Dependencias por Proveedor

```bash
# Local Vault (incluido en requirements.txt)
pip install cryptography

# AWS Secrets Manager
pip install boto3

# Azure Key Vault
pip install azure-identity azure-keyvault-secrets

# HashiCorp Vault
pip install hvac
```

### Local Vault - Para Industrias Reguladas (HIPAA, PCI-DSS)

El Local Vault es la opción recomendada para:
- **Healthcare** (HIPAA, HITECH)
- **Finanzas** (PCI-DSS, SOX)
- **Gobierno** (FedRAMP)
- **Bots standalone** sin conexión a Orchestrator

#### Características de Seguridad

| Característica | Especificación | Estándar |
|----------------|----------------|----------|
| Encriptación | AES-256-GCM | NIST FIPS 197 |
| Derivación de clave | PBKDF2-SHA256 | NIST SP 800-132 |
| Iteraciones | 600,000 | OWASP 2023 |
| Salt | 32 bytes (256 bits) | NIST |
| IV | 12 bytes (96 bits) | NIST GCM |
| Authentication Tag | 16 bytes (128 bits) | GCM |
| Audit Logging | Todas las operaciones | HIPAA §164.312 |

#### Estructura de Archivos

```
mi-proyecto/.skuldbot/
├── vault.enc          # Secretos encriptados (AES-256-GCM)
├── vault.meta         # Metadata (salt, version, timestamps)
└── vault.audit.log    # Log de auditoría (JSON lines)
```

**IMPORTANTE**: Agregar a `.gitignore`:
```gitignore
.skuldbot/vault.enc
.skuldbot/vault.meta
.skuldbot/vault.audit.log
```

#### Crear un Vault Local

```robot
*** Settings ***
Library    SkuldVault

*** Tasks ***
Setup Vault
    # Crear nuevo vault con master password
    Create Local Vault    mi-password-muy-seguro-2024!

    # Guardar secretos
    Set Secret    DB_PASSWORD    postgres123    provider=local
    Set Secret    API_KEY    sk-xxxx    provider=local    description=OpenAI API Key

    # Bloquear al terminar
    Lock Local Vault
```

#### Usar Vault Existente

```robot
*** Settings ***
Library    SkuldVault    local_vault_password=%{SKULDBOT_VAULT_PASSWORD}

*** Tasks ***
Use Secrets
    # El vault se desbloquea automáticamente si SKULDBOT_VAULT_PASSWORD está definido
    ${db_pass}=    Get Secret    DB_PASSWORD    provider=local
    ${api_key}=    Get Secret    API_KEY    provider=local

    # Verificar estado
    ${is_unlocked}=    Local Vault Is Unlocked
    Log    Vault unlocked: ${is_unlocked}
```

#### Desbloqueo Manual

```robot
*** Tasks ***
Manual Unlock
    # Si no usas la variable de entorno
    Unlock Local Vault    mi-password-seguro

    # Usar secretos
    ${secret}=    Get Secret    MY_SECRET    provider=local

    # Bloquear al terminar
    Lock Local Vault
```

#### Cambiar Password

```robot
*** Tasks ***
Rotate Password
    Change Vault Password    old-password    new-password-2024!
```

#### Auditoría (HIPAA Compliance)

```robot
*** Tasks ***
Review Audit Log
    # Obtener últimas 50 entradas
    ${log}=    Get Vault Audit Log    limit=50

    # Cada entrada contiene:
    # - timestamp (ISO 8601)
    # - action (vault_unlocked, secret_read, secret_created, etc.)
    # - secret_name (si aplica)
    # - success (boolean)
    # - details (si hay error)

    FOR    ${entry}    IN    @{log}
        Log    ${entry}[timestamp]: ${entry}[action] - ${entry}[secret_name]
    END
```

#### Uso en Python (BotRunner)

```python
from skuldbot.libs.local_vault import LocalVault

# Crear vault
vault = LocalVault("/path/to/project/.skuldbot", enable_audit=True)
vault.create("mi-password-seguro")

# Guardar secretos
vault.set_secret("DB_HOST", "localhost", description="Database host")
vault.set_secret("DB_PASSWORD", "secret123")

# Leer secretos
password = vault.get_secret("DB_PASSWORD")
print(password)  # Output: secret123

# Listar secretos (sin valores)
secrets = vault.list_secrets()
for s in secrets:
    print(f"{s['name']}: {s['description']}")

# Bloquear
vault.lock()
```

#### Fallback Chain

Cuando usas `provider=local`, el sistema intenta:
1. **Local Vault** (si está desbloqueado)
2. **Variables de entorno** (`os.environ`)
3. **Archivo `.env`**
4. **Valor default** (si se proporciona)

```robot
# Si DB_HOST no está en el vault local, busca en ENV, luego .env
${host}=    Get Secret    DB_HOST    provider=local    default=localhost
```

#### Integración con BotRunner

El BotRunner puede leer el vault local usando la variable de entorno:

```bash
# En el entorno del BotRunner
export SKULDBOT_VAULT_PASSWORD="mi-password-seguro"

# Ejecutar el bot
robot --outputdir results my_bot.robot
```

O pasando el password al inicializar la librería:

```robot
*** Settings ***
Library    SkuldVault
...    default_provider=local
...    local_vault_path=/path/to/project/.skuldbot
...    local_vault_password=mi-password-seguro
```

#### Deployment en Producción (BotRunner)

**Opción 1: Variable de entorno (Recomendado para containers)**

```dockerfile
# Dockerfile del BotRunner
FROM python:3.11-slim

# Instalar dependencias
COPY requirements.txt .
RUN pip install -r requirements.txt

# El password se pasa en runtime
ENV SKULDBOT_VAULT_PASSWORD=""

COPY . /app
WORKDIR /app

CMD ["robot", "--outputdir", "results", "main.robot"]
```

```bash
# Docker run con password
docker run -e SKULDBOT_VAULT_PASSWORD="$VAULT_PWD" my-bot:latest
```

**Opción 2: Kubernetes Secret**

```yaml
# kubernetes/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: skuldbot-vault
type: Opaque
data:
  password: <base64-encoded-password>

---
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bot-runner
spec:
  template:
    spec:
      containers:
      - name: bot
        image: my-bot:latest
        env:
        - name: SKULDBOT_VAULT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: skuldbot-vault
              key: password
```

**Opción 3: Systemd Service (Linux on-premise)**

```ini
# /etc/systemd/system/skuldbot-runner.service
[Unit]
Description=SkuldBot Runner
After=network.target

[Service]
Type=simple
User=skuldbot
WorkingDirectory=/opt/skuldbot
Environment="SKULDBOT_VAULT_PASSWORD=mi-password-seguro"
ExecStart=/opt/skuldbot/venv/bin/robot --outputdir results main.robot
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

#### Migración de Secretos

Para migrar secretos entre ambientes o proveedores:

```python
from skuldbot.libs.vault import SkuldVault
from skuldbot.libs.local_vault import LocalVault

# Exportar desde ENV a Local Vault
vault = SkuldVault()
local = LocalVault("/path/to/.skuldbot")
local.create("master-password")

# Migrar secretos
secrets_to_migrate = ["DB_HOST", "DB_PASSWORD", "API_KEY"]
for name in secrets_to_migrate:
    value = vault.get_secret(name, provider="env")
    if value:
        local.set_secret(name, value.value)

local.lock()
print("Migración completada")
```

### Azure Key Vault - Configuración Detallada

#### 1. Crear Key Vault en Azure

```bash
# Crear resource group
az group create --name rg-skuldbot --location eastus

# Crear Key Vault
az keyvault create \
  --name kv-skuldbot \
  --resource-group rg-skuldbot \
  --location eastus

# Agregar un secreto
az keyvault secret set \
  --vault-name kv-skuldbot \
  --name "API-KEY" \
  --value "sk-xxxxxxxxxxxx"
```

#### 2. Configurar Autenticación

**Opción A: Service Principal (Producción)**

```bash
# Crear Service Principal
az ad sp create-for-rbac --name sp-skuldbot --skip-assignment

# Output:
# {
#   "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
#   "password": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
#   "tenant": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
# }

# Asignar permisos al Key Vault
az keyvault set-policy \
  --name kv-skuldbot \
  --spn <appId> \
  --secret-permissions get list
```

```bash
# Variables de entorno
export AZURE_CLIENT_ID="<appId>"
export AZURE_CLIENT_SECRET="<password>"
export AZURE_TENANT_ID="<tenant>"
export AZURE_KEYVAULT_URL="https://kv-skuldbot.vault.azure.net/"
```

**Opción B: Azure CLI (Desarrollo)**

```bash
# Login con tu cuenta
az login

# Solo necesitas la URL del vault
export AZURE_KEYVAULT_URL="https://kv-skuldbot.vault.azure.net/"
```

**Opción C: Managed Identity (Azure VMs/App Service)**

```bash
# Solo necesitas la URL - la identidad se detecta automáticamente
export AZURE_KEYVAULT_URL="https://kv-skuldbot.vault.azure.net/"
```

#### 3. Uso en Robot Framework

```robot
*** Settings ***
Library    SkuldVault

*** Tasks ***
Use Azure Secrets
    # Obtener secreto de Azure Key Vault
    ${api_key}=    Get Secret    API-KEY    provider=azure

    # Usar el secreto
    Log    API Key retrieved (value hidden)
```

#### 4. Uso en Python

```python
from skuldbot.libs.vault import SkuldVault

vault = SkuldVault()

# Obtener secreto
api_key = vault.get_secret("API-KEY", provider="azure")
print(f"Got secret: {api_key}")  # Output: Got secret: ***REDACTED***

# Usar el valor real
actual_value = api_key  # El string real cuando se usa
```

#### 5. Fallback Chain

Si Azure falla, el sistema intenta automáticamente:
1. Azure Key Vault (proveedor especificado)
2. Variables de entorno (`os.environ`)
3. Archivo `.env`
4. Valor default (si se proporciona)

```robot
# Si API-KEY no existe en Azure, busca en ENV, luego .env
${key}=    Get Secret    API_KEY    provider=azure    default=fallback-key
```

## SkuldVault Library (Python)

### Ubicación
```
engine/skuldbot/libs/vault.py
```

### Uso en Robot Framework

```robot
*** Settings ***
Library    SkuldVault    cache_secrets=True

*** Tasks ***
Use Secrets
    # Obtener un secreto
    ${api_key}=    Get Secret    MY_API_KEY    provider=ORCHESTRATOR

    # Verificar existencia
    ${exists}=    Secret Exists    DATABASE_URL

    # Obtener como diccionario (JSON)
    ${creds}=    Get Secret As Dictionary    AWS_CREDENTIALS
    Log    User: ${creds}[access_key_id]

    # Hashear un valor
    ${hashed}=    Hash Secret    password123    algorithm=SHA256

    # Enmascarar en strings
    ${safe}=    Mask Secret In String    Error with key: sk-12345    sk-12345
    # Resultado: "Error with key: ***"

    # Listar secretos disponibles
    @{secrets}=    List Secrets    provider=ENV
```

### Uso en Python

```python
from skuldbot.libs.vault import SkuldVault

vault = SkuldVault(cache_secrets=True)

# Obtener secreto
api_key = vault.get_secret("API_KEY", provider="ORCHESTRATOR")

# El valor está protegido
print(api_key)  # Output: SecretValue(name='API_KEY', value='***')
print(api_key.value)  # Output: el valor real

# Hashear
hashed = vault.hash_secret("password", algorithm="SHA256")

# Limpiar cache
vault.clear_secret_cache()
```

### Clase SecretValue

Los secretos se devuelven envueltos en `SecretValue` para protección:

```python
@dataclass
class SecretValue:
    name: str
    value: str

    def __repr__(self) -> str:
        return f"SecretValue(name='{self.name}', value='***')"

    def __str__(self) -> str:
        return "***"
```

**Beneficios:**
- El valor real nunca se muestra en logs
- `print(secret)` muestra `***`
- Acceso al valor real via `secret.value`

## DSL: Definición de Credenciales

### Modelo de Variables

```python
# engine/skuldbot/dsl/models.py

class VariableDefinition(BaseModel):
    type: Literal["string", "number", "boolean", "credential", "file", "json"]
    value: Optional[Any] = None
    vault: Optional[str] = None  # Provider: "orchestrator", "aws", etc.
    description: Optional[str] = None
```

### Ejemplo en DSL JSON

```json
{
  "version": "1.0",
  "bot": {
    "id": "bot-001",
    "name": "Data Extractor"
  },
  "variables": {
    "api_url": {
      "type": "string",
      "value": "https://api.example.com"
    },
    "api_key": {
      "type": "credential",
      "vault": "orchestrator",
      "description": "API key for authentication"
    },
    "db_credentials": {
      "type": "credential",
      "vault": "aws",
      "description": "Database connection credentials (JSON)"
    }
  },
  "nodes": [...]
}
```

**Importante:** Las credenciales NO tienen `value` en el DSL, solo referencias.

## Nodos de Seguridad (Studio)

### Ubicación
```
studio/src/data/nodeTemplates.ts
```

### Nodos Disponibles

| Nodo | Descripción |
|------|-------------|
| `security.get_secret` | Obtener un secreto del vault |
| `security.encrypt` | Encriptar datos |
| `security.decrypt` | Desencriptar datos |
| `security.hash` | Hashear datos (SHA256, SHA512, MD5) |
| `security.mask_data` | Enmascarar datos sensibles |
| `security.validate_cert` | Validar certificados SSL |

### Ejemplo: Nodo Get Secret

```typescript
{
  type: "security.get_secret",
  category: "Security",
  label: "Get Secret",
  description: "Retrieve a secret from the vault",
  icon: "KeyRound",
  fields: [
    { name: "secret_name", label: "Secret Name", type: "text", required: true },
    { name: "provider", label: "Provider", type: "select",
      options: ["orchestrator", "env", "aws", "azure", "hashicorp"] },
    { name: "output_var", label: "Output Variable", type: "text", required: true }
  ],
  outputs: { success: true, error: true }
}
```

## UI: Panel de Variables de Entorno

### Ubicación
```
studio/src/components/EnvPanel.tsx
```

### Características
- **3 ambientes**: Development, Staging, Production
- **Toggle de secreto**: Marca variables como secretas
- **Visibilidad**: Show/hide para valores secretos
- **Copiar**: Botón para copiar al portapapeles
- **Validación**: Nombres en UPPERCASE con underscores

### Estructura de Variable

```typescript
interface EnvVariable {
  id: string;
  name: string;      // e.g., "API_KEY"
  value: string;     // El valor (encriptado si isSecret)
  isSecret: boolean; // Si debe ocultarse en UI
}
```

## Compilador: Manejo de Credenciales

### Ubicación
```
engine/skuldbot/compiler/compiler.py
```

### Proceso

1. **Detección**: `_has_credentials()` busca variables tipo `credential`
2. **Exclusión**: Los valores de credentials NO se incluyen en el Bot Package
3. **Manifest**: Se marca `requires_credentials: true`
4. **Referencias**: Solo se incluyen los nombres de las credenciales requeridas

```python
def _has_credentials(self, bot_def: BotDefinition) -> bool:
    """Verifica si el bot requiere credenciales"""
    for var_def in bot_def.variables.values():
        if var_def.type == "credential":
            return True
    return False
```

## Configuración del Orchestrator

### Variables de Entorno

```bash
# URL del Orchestrator
SKULDBOT_ORCHESTRATOR_URL=https://orchestrator.example.com

# Token de autenticación
SKULDBOT_ORCHESTRATOR_TOKEN=sk-xxxxxxxxxxxx
```

### API Endpoints

```
GET  /api/v1/vault/secrets/{name}    # Obtener secreto
POST /api/v1/vault/secrets/{name}    # Crear/actualizar secreto
DEL  /api/v1/vault/secrets/{name}    # Eliminar secreto
GET  /api/v1/vault/secrets           # Listar secretos
```

## Algoritmos de Hashing

| Algoritmo | Uso Recomendado |
|-----------|-----------------|
| `SHA256` | General, verificación de integridad |
| `SHA512` | Mayor seguridad, datos críticos |
| `MD5` | Legacy, NO recomendado para seguridad |

```python
# Ejemplo
hashed = vault.hash_secret("my_password", algorithm="SHA256")
```

## Buenas Prácticas

### DO (Hacer)

1. **Usar referencias**: Nunca hardcodear secretos en DSL
   ```json
   { "type": "credential", "vault": "orchestrator" }
   ```

2. **Marcar como secreto**: En EnvPanel, activar `isSecret` para credenciales

3. **Usar SecretValue**: Acceder via `.value` solo cuando sea necesario

4. **Limpiar cache**: Llamar `clear_secret_cache()` después de operaciones sensibles

5. **Hashear passwords**: Almacenar solo hashes, nunca texto plano

### DON'T (No Hacer)

1. **NO** incluir valores de credentials en el DSL
2. **NO** loggear secretos directamente
3. **NO** usar MD5 para seguridad
4. **NO** deshabilitar cache sin razón (performance)
5. **NO** exponer tokens en repositorios

## Estado de Implementación

| Feature | Estado | Notas |
|---------|--------|-------|
| Multi-provider vault | ✅ Completo | ENV, DOTENV, LOCAL, Orchestrator, AWS, Azure, HashiCorp |
| Local Vault (AES-256-GCM) | ✅ Completo | PBKDF2-SHA256, 600K iteraciones, HIPAA compliant |
| Audit Logging | ✅ Completo | JSON lines, HIPAA §164.312 |
| Secret hashing | ✅ Completo | SHA256, SHA512, MD5 |
| Secret masking | ✅ Completo | SecretValue, mask_secret_in_string |
| Credential DSL type | ✅ Completo | Modelo y compilador |
| Security nodes | ✅ Completo | Templates en Studio |
| EnvPanel UI | ✅ Completo | 3 ambientes, toggle secreto |
| End-to-end encryption | ✅ Completo | AES-256-GCM en Local Vault |
| Secret rotation | ❌ Pendiente | - |

## Roadmap

### Fase 1 - Completado
- [x] SkuldVault library
- [x] Multi-provider support (7 proveedores)
- [x] DSL credential type
- [x] Compiler credential handling
- [x] Security node templates
- [x] EnvPanel UI

### Fase 2 - Completado
- [x] Local Vault con AES-256-GCM encryption
- [x] PBKDF2-SHA256 key derivation (600K iteraciones)
- [x] Audit logging (HIPAA §164.312 compliant)
- [x] Robot Framework keywords para Local Vault
- [x] Integración con BotRunner

### Fase 3 (Próxima)
- [ ] Client-side encryption en Studio
- [ ] UI para gestionar Local Vault desde Studio
- [ ] Secret rotation automática

### Fase 4 (Futuro)
- [ ] Integración con HSM
- [ ] mTLS para comunicación con Orchestrator
- [ ] Políticas de acceso (RBAC) por secreto
- [ ] Backup/restore de vaults encriptados

## Archivos de Implementación

### Local Vault

| Archivo | Descripción |
|---------|-------------|
| [local_vault.py](../engine/skuldbot/libs/local_vault.py) | Implementación core del vault local con AES-256-GCM |
| [vault.py](../engine/skuldbot/libs/vault.py) | SkuldVault library con soporte multi-provider |
| [requirements.txt](../engine/requirements.txt) | Dependencia `cryptography>=41.0.0` |

### Robot Framework Keywords

**Keywords del Local Vault:**

| Keyword | Descripción |
|---------|-------------|
| `Create Local Vault` | Crear un nuevo vault con master password |
| `Unlock Local Vault` | Desbloquear vault existente |
| `Lock Local Vault` | Bloquear vault y limpiar keys de memoria |
| `Change Vault Password` | Cambiar master password |
| `Get Vault Audit Log` | Obtener log de auditoría |
| `Local Vault Is Unlocked` | Verificar si el vault está desbloqueado |

**Keywords Generales:**

| Keyword | Descripción |
|---------|-------------|
| `Get Secret` | Obtener secreto de cualquier provider |
| `Set Secret` | Guardar secreto (LOCAL, ORCHESTRATOR) |
| `Delete Secret` | Eliminar secreto |
| `List Secrets` | Listar nombres de secretos |
| `Secret Exists` | Verificar si existe un secreto |
| `Hash Secret` | Hashear un valor (SHA256, SHA512, MD5) |
| `Mask Secret In String` | Reemplazar secreto con `***` en strings |
| `Clear Secret Cache` | Limpiar cache de secretos |

## Compliance y Certificaciones

El sistema de vault de SkuldBot está diseñado para cumplir con:

| Regulación | Características |
|------------|-----------------|
| **HIPAA** | Audit logging, encryption at rest (AES-256), access controls |
| **PCI-DSS** | Strong cryptography, key management, audit trails |
| **SOC 2** | Encryption, access logging, data protection |
| **GDPR** | Data encryption, audit capabilities |
| **FedRAMP** | FIPS-compliant algorithms (AES-256, SHA-256) |

### Recomendaciones por Industria

| Industria | Provider Recomendado | Alternativa |
|-----------|---------------------|-------------|
| Healthcare (HIPAA) | `LOCAL` o `AZURE` | `AWS` |
| Finanzas (PCI-DSS) | `LOCAL` o `HASHICORP` | `AWS` |
| Gobierno (FedRAMP) | `LOCAL` o `AWS` | `AZURE` |
| Startups | `LOCAL` o `ENV` | `DOTENV` |
| Enterprise | `ORCHESTRATOR` | `HASHICORP` |

## Troubleshooting

### Error: "Vault is locked"

```
VaultError: Vault is locked. Call unlock() first.
```

**Solución**: El vault necesita ser desbloqueado antes de acceder a secretos.

```robot
# En Robot Framework
Unlock Local Vault    ${PASSWORD}

# O usar variable de entorno
# export SKULDBOT_VAULT_PASSWORD="mi-password"
```

### Error: "Invalid password"

```
VaultError: Invalid password
```

**Solución**: La contraseña proporcionada no coincide con la usada al crear el vault. Verifica:
1. La variable `SKULDBOT_VAULT_PASSWORD` tiene el valor correcto
2. No hay espacios en blanco adicionales
3. El encoding es correcto (UTF-8)

### Error: "Vault already exists"

```
VaultError: Vault already exists at /path/.skuldbot
```

**Solución**: Ya existe un vault en esa ubicación. Usa `unlock()` en lugar de `create()`.

### Error: "Secret not found"

```
SecretNotFoundError: Secret 'MY_SECRET' not found
```

**Solución**:
1. Verifica que el secreto fue agregado: `List Secrets    provider=local`
2. Verifica que el vault está desbloqueado
3. Si usas fallback, verifica las variables de entorno

### Audit log no se genera

**Solución**: Asegúrate de inicializar con `enable_audit=True`:

```python
vault = LocalVault("/path/.skuldbot", enable_audit=True)
```

```robot
Library    SkuldVault    enable_audit=True
```

### Performance lento con muchos secretos

**Causa**: El vault carga todos los secretos en memoria al desbloquear.

**Solución**:
1. Usar cache: `Library    SkuldVault    cache_secrets=True`
2. Dividir secretos en múltiples vaults por proyecto
3. Para >1000 secretos, considerar HashiCorp Vault o AWS Secrets Manager

## FAQ

### ¿El vault local es seguro para producción?

**Sí**, si se siguen las mejores prácticas:
- AES-256-GCM es el estándar de la industria (usado por AWS, Azure, Google)
- PBKDF2 con 600K iteraciones protege contra ataques de fuerza bruta
- El archivo `.skuldbot/` debe estar en `.gitignore`
- El master password debe almacenarse de forma segura (ej: Kubernetes Secrets, Vault externo)

### ¿Puedo usar múltiples proveedores simultáneamente?

**Sí**, cada llamada a `Get Secret` puede especificar un proveedor diferente:

```robot
${local_secret}=    Get Secret    DB_PASS    provider=local
${azure_secret}=    Get Secret    API_KEY    provider=azure
${env_secret}=      Get Secret    HOME       provider=env
```

### ¿Cómo roto el master password sin downtime?

1. Crear nuevo vault con nuevo password
2. Migrar secretos programáticamente
3. Actualizar la variable de entorno en el BotRunner
4. Eliminar vault antiguo

```python
# Script de rotación
old_vault = LocalVault("/path/.skuldbot")
old_vault.unlock("old-password")

new_vault = LocalVault("/path/.skuldbot-new")
new_vault.create("new-secure-password-2024!")

for secret in old_vault.list_secrets():
    value = old_vault.get_secret(secret["name"])
    new_vault.set_secret(secret["name"], value, description=secret.get("description"))

old_vault.lock()
new_vault.lock()

# Luego renombrar directorios
```

### ¿El vault funciona en Windows?

**Sí**, todas las rutas se manejan de forma cross-platform. Usa `Path` de `pathlib`:

```python
from pathlib import Path
vault_path = Path.home() / ".skuldbot"
```

### ¿Cómo hago backup del vault?

1. **Backup encriptado** (recomendado):
   ```bash
   cp -r /project/.skuldbot /backup/vault-$(date +%Y%m%d)
   ```

2. **Export a JSON** (solo si es necesario, menos seguro):
   ```python
   vault.unlock("password")
   secrets = {s["name"]: vault.get_secret(s["name"]) for s in vault.list_secrets()}
   # Encriptar el JSON antes de almacenar
   ```

### ¿Es compatible con Robot Framework Secrets Library?

La API es compatible. Puedes migrar fácilmente:

```robot
# Antes (RF Secrets)
${secret}=    Get Secret    MY_SECRET

# Después (SkuldVault)
${secret}=    Get Secret    MY_SECRET    provider=local
```

---

**Última actualización:** Diciembre 2025
**Versión del documento:** 2.0
**Autor:** Equipo Khipus
