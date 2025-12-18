# Data Integration - SkuldBot

Sistema de integración de datos industriales que convierte SkuldBot en una plataforma híbrida **RPA + Data Integration**.

## Visión General

SkuldBot integra conectores de datos industriales como nodos visuales drag & drop, permitiendo:
- Extraer datos de bases de datos empresariales
- Cargar datos a data warehouses
- Transferir archivos entre sistemas
- Integrar con SaaS (Salesforce, APIs)
- Combinar RPA tradicional con pipelines de datos

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                        STUDIO (React)                            │
├──────────────────────────────────────────────────────────────────┤
│  Categoría: "data" (Taps - Extractores)                          │
│  ├── data.tap.sqlserver     (SQL Server)                         │
│  ├── data.tap.oracle        (Oracle Database)                    │
│  ├── data.tap.postgres      (PostgreSQL)                         │
│  ├── data.tap.mysql         (MySQL / MariaDB)                    │
│  ├── data.tap.db2           (IBM DB2)                            │
│  ├── data.tap.snowflake     (Snowflake)                          │
│  ├── data.tap.salesforce    (Salesforce CRM)                     │
│  ├── data.tap.rest_api      (Cualquier REST API)                 │
│  ├── data.tap.csv           (Leer CSV)                           │
│  ├── data.tap.excel         (Leer Excel)                         │
│  ├── data.tap.sftp          (Leer de SFTP)                       │
│  └── data.tap.s3            (Leer de S3)                         │
│                                                                   │
│  Categoría: "data" (Targets - Cargadores)                        │
│  ├── data.target.sqlserver  (SQL Server)                         │
│  ├── data.target.oracle     (Oracle Database)                    │
│  ├── data.target.postgres   (PostgreSQL)                         │
│  ├── data.target.mysql      (MySQL / MariaDB)                    │
│  ├── data.target.db2        (IBM DB2)                            │
│  ├── data.target.snowflake  (Snowflake)                          │
│  ├── data.target.bigquery   (Google BigQuery)                    │
│  ├── data.target.csv        (Escribir CSV)                       │
│  ├── data.target.excel      (Escribir Excel)                     │
│  ├── data.target.sftp       (Escribir a SFTP)                    │
│  └── data.target.s3         (Escribir a S3)                      │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     ENGINE (Python)                               │
├──────────────────────────────────────────────────────────────────┤
│  DataLibrary (Robot Framework Keywords)                          │
│  ├── Extract From Database                                        │
│  ├── Load To Database                                             │
│  ├── Extract From CSV / Load To CSV                               │
│  ├── Extract From Excel / Load To Excel                           │
│  ├── Extract From S3 / Load To S3                                 │
│  ├── Extract From SFTP / Load To SFTP                             │
│  ├── Extract From Salesforce                                      │
│  └── Extract From REST API                                        │
└──────────────────────────────────────────────────────────────────┘
```

## Decisiones de Diseño

1. **Pre-bundled**: Todos los conectores vienen incluidos en el instalador del engine (desde skuldbot.com, no PyPI)
2. **Streaming + Batching**: Para datasets grandes, evitar problemas de memoria
3. **Sin Meltano**: SkuldBot tiene su propio orquestador
4. **Consultas Selectivas**: Soporte para filtros, proyección y sync incremental

## Nodos Disponibles

### Taps (Extractores)

| Nodo | Descripción | Tipo DB |
|------|-------------|---------|
| `data.tap.sqlserver` | Microsoft SQL Server | RDBMS |
| `data.tap.oracle` | Oracle Database | RDBMS |
| `data.tap.postgres` | PostgreSQL | RDBMS |
| `data.tap.mysql` | MySQL / MariaDB | RDBMS |
| `data.tap.db2` | IBM DB2 | RDBMS |
| `data.tap.snowflake` | Snowflake | Cloud DW |
| `data.tap.csv` | Archivos CSV | File |
| `data.tap.excel` | Archivos Excel | File |
| `data.tap.s3` | Amazon S3 | Cloud Storage |
| `data.tap.sftp` | SFTP Server | File Transfer |
| `data.tap.salesforce` | Salesforce CRM | SaaS |
| `data.tap.rest_api` | REST API genérico | API |

### Targets (Cargadores)

| Nodo | Descripción | Tipo DB |
|------|-------------|---------|
| `data.target.sqlserver` | Microsoft SQL Server | RDBMS |
| `data.target.oracle` | Oracle Database | RDBMS |
| `data.target.postgres` | PostgreSQL | RDBMS |
| `data.target.mysql` | MySQL / MariaDB | RDBMS |
| `data.target.db2` | IBM DB2 | RDBMS |
| `data.target.snowflake` | Snowflake | Cloud DW |
| `data.target.bigquery` | Google BigQuery | Cloud DW |
| `data.target.csv` | Archivos CSV | File |
| `data.target.excel` | Archivos Excel | File |
| `data.target.s3` | Amazon S3 | Cloud Storage |
| `data.target.sftp` | SFTP Server | File Transfer |

## Consultas Selectivas

Los taps soportan múltiples formas de filtrar datos para traer solo lo necesario:

### 1. Query SQL Personalizado
```json
{
  "type": "data.tap.sqlserver",
  "config": {
    "query": "SELECT id, name, email FROM customers WHERE active = 1 ORDER BY created_at DESC"
  }
}
```

### 2. Tabla con Filtros WHERE
```json
{
  "type": "data.tap.oracle",
  "config": {
    "table": "orders",
    "filter": "status = 'pending' AND created_at > '2024-01-01'"
  }
}
```

### 3. Proyección de Columnas
```json
{
  "type": "data.tap.postgres",
  "config": {
    "table": "customers",
    "columns": "id, name, email"
  }
}
```

### 4. Límite de Records
```json
{
  "type": "data.tap.snowflake",
  "config": {
    "table": "transactions",
    "limit": 1000
  }
}
```

## Streaming + Batching (Datasets Grandes)

Para evitar problemas de memoria con millones de records:

```json
{
  "type": "data.tap.sqlserver",
  "config": {
    "table": "massive_table",
    "batch_size": 10000,
    "mode": "batch"
  }
}
```

### Modos Disponibles

| Modo | Descripción | Uso Recomendado |
|------|-------------|-----------------|
| `memory` | Carga todo en memoria | < 50K filas, ideal para For Each |
| `batch` | Procesa en lotes | > 50K filas, ideal para Target directo |

## Variables de Salida

Cada nodo Tap produce las siguientes variables:

```
${Node Label.records}      // Lista de diccionarios con los datos
${Node Label.columns}      // Lista de nombres de columnas
${Node Label.recordCount}  // Número de registros extraídos
```

Cada nodo Target produce:

```
${Node Label.insertedCount}  // Records insertados
${Node Label.updatedCount}   // Records actualizados (upsert)
${Node Label.errorCount}     // Records con error
```

## Casos de Uso

### Caso 1: BD → UI (Consulta específica a formulario web)
```
[Tap: SQL Server] ──> [For Each Row] ──> [Web: Fill Form] ──> [Web: Submit]
     │                      │
     │ query: "SELECT * FROM pending_orders WHERE date = TODAY"
     │ records[]            │ ${row.order_id}, ${row.customer}
```

### Caso 2: UI → BD (Scraping a base de datos)
```
[Web: Open] ──> [Web: Scrape Table] ──> [Target: PostgreSQL]
                      │                        │
                      │ scraped_data[]         │ inserta en tabla
```

### Caso 3: Migración Oracle → Snowflake (Datasets grandes)
```
[Tap: Oracle] ──────────────────────> [Target: Snowflake]
     │                                       │
     │ mode: "batch"                         │ batch directo
     │ batch_size: 50000                     │ sin cargar en memoria
```

### Caso 4: Multi-source ETL con filtros
```
[Tap: Salesforce] ─────┐    query: "SELECT Id, Name FROM Account WHERE Status = 'Active'"
                       │
[Tap: SQL Server] ─────┼──> [Merge/Transform] ──> [Target: BigQuery]
     │                 │
     │ query: "SELECT * FROM sales WHERE year = 2024"
```

### Caso 5: Archivo CSV → Base de datos
```
[Tap: CSV] ──> [Target: PostgreSQL]
     │              │
     │ path: "/data/import.csv"
     │ delimiter: ","
     │              │ table: "imported_data"
     │              │ mode: "insert"
```

### Caso 6: Salesforce → Excel Report
```
[Tap: Salesforce] ──> [Target: Excel]
     │                      │
     │ query: "SELECT Id, Name, Amount FROM Opportunity WHERE StageName = 'Closed Won'"
     │                      │ path: "/reports/won_deals.xlsx"
     │                      │ sheet: "Won Deals"
```

## Configuración de Nodos

### Tap de Base de Datos (Ejemplo: SQL Server)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `host` | text | ✓ | Servidor de base de datos |
| `port` | number | | Puerto (default: 1433) |
| `database` | text | ✓ | Nombre de la base de datos |
| `username` | text | ✓ | Usuario |
| `password` | password | ✓ | Contraseña (soporta ${vault.xxx}) |
| `query` | textarea | | Query SQL personalizado |
| `table` | text | | Nombre de tabla (si no usa query) |
| `columns` | text | | Columnas a seleccionar (separadas por coma) |
| `filter` | text | | Condición WHERE |
| `limit` | number | | Máximo de filas |
| `batch_size` | number | | Tamaño de lote (default: 10000) |
| `mode` | select | | `memory` o `batch` |

### Target de Base de Datos (Ejemplo: PostgreSQL)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `host` | text | ✓ | Servidor de base de datos |
| `port` | number | | Puerto (default: 5432) |
| `database` | text | ✓ | Nombre de la base de datos |
| `username` | text | ✓ | Usuario |
| `password` | password | ✓ | Contraseña |
| `table` | text | ✓ | Tabla destino |
| `records` | expression | ✓ | Records a insertar (${Tap.records}) |
| `mode` | select | | `insert`, `upsert`, `replace` |
| `batch_size` | number | | Tamaño de lote (default: 5000) |

### Tap de Archivo (Ejemplo: CSV)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `path` | text | ✓ | Ruta al archivo |
| `delimiter` | text | | Delimitador (default: `,`) |
| `encoding` | text | | Encoding (default: `utf-8`) |
| `header` | boolean | | Primera fila es header (default: true) |
| `columns` | text | | Columnas a seleccionar |
| `limit` | number | | Máximo de filas |

### Tap de Salesforce

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `username` | text | ✓ | Usuario de Salesforce |
| `password` | password | ✓ | Contraseña |
| `security_token` | password | ✓ | Token de seguridad |
| `query` | textarea | ✓ | Query SOQL |
| `domain` | select | | `login` o `test` (sandbox) |

### Tap de REST API

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `url` | text | ✓ | URL del endpoint |
| `method` | select | | GET, POST, PUT, DELETE |
| `headers` | textarea | | Headers JSON |
| `params` | textarea | | Query params JSON |
| `body` | textarea | | Request body JSON |
| `auth_type` | select | | `none`, `basic`, `bearer`, `api_key` |
| `pagination_type` | select | | `none`, `offset`, `cursor`, `link` |

## Dependencias (requirements.txt)

```txt
# Data Integration - Database Connectors (Pre-bundled)
psycopg2-binary>=2.9.9       # PostgreSQL
pymysql>=1.1.0               # MySQL / MariaDB
pyodbc>=5.0.1                # SQL Server (requires ODBC Driver 17+)
cx_Oracle>=8.3.0             # Oracle Database
# ibm_db>=3.2.0              # IBM DB2 (uncomment when needed)
snowflake-connector-python>=3.6.0  # Snowflake

# Data Integration - Files & Cloud
boto3>=1.34.0                # AWS S3
paramiko>=3.4.0              # SFTP
openpyxl>=3.1.2              # Excel files
requests>=2.31.0             # REST APIs

# Data Integration - SaaS Connectors
simple-salesforce>=1.12.0    # Salesforce CRM

# Data Integration - Cloud Data Warehouses
google-cloud-bigquery>=3.14.0  # Google BigQuery
```

## Archivos del Sistema

### Studio (TypeScript/React)

| Archivo | Descripción |
|---------|-------------|
| [studio/src/data/nodeTemplates.ts](../studio/src/data/nodeTemplates.ts) | Definición de los 23 nodos data (taps y targets) |
| [studio/src/types/flow.ts](../studio/src/types/flow.ts) | Tipo `NodeCategory` incluye `"data"` |
| [studio/src/components/CustomNode.tsx](../studio/src/components/CustomNode.tsx) | Estilo cyan para categoría data |

### Engine (Python)

| Archivo | Descripción |
|---------|-------------|
| [engine/skuldbot/libs/data.py](../engine/skuldbot/libs/data.py) | DataLibrary con todos los keywords |
| [engine/skuldbot/compiler/templates/main_v2.robot.j2](../engine/skuldbot/compiler/templates/main_v2.robot.j2) | Handlers para nodos data.tap.* y data.target.* |
| [engine/requirements.txt](../engine/requirements.txt) | Dependencias de conectores |

## Robot Framework Keywords

La DataLibrary expone los siguientes keywords:

### Extracción
- `Extract From Database` - Extrae de cualquier BD soportada
- `Extract From CSV` - Lee archivo CSV
- `Extract From Excel` - Lee archivo Excel
- `Extract From S3` - Descarga y lee desde S3
- `Extract From SFTP` - Descarga y lee desde SFTP
- `Extract From Salesforce` - Ejecuta query SOQL
- `Extract From REST API` - Llama endpoint REST con paginación

### Carga
- `Load To Database` - Inserta/upsert en cualquier BD
- `Load To CSV` - Escribe archivo CSV
- `Load To Excel` - Escribe archivo Excel
- `Load To S3` - Sube archivo a S3
- `Load To SFTP` - Sube archivo a SFTP
- `Load To BigQuery` - Carga a Google BigQuery

## Seguridad

1. **Credenciales**: Usar `${vault.db_password}` para secretos
2. **Timeout**: Configurable por nodo
3. **Max Records**: Límite con campo `limit`
4. **Connection Pooling**: Reutilizar conexiones en batch mode

## Ejemplo DSL Completo

```json
{
  "version": "1.0",
  "bot": {
    "id": "etl-salesforce-snowflake",
    "name": "Sync Salesforce to Snowflake",
    "description": "Extrae oportunidades cerradas y las carga a Snowflake"
  },
  "nodes": [
    {
      "id": "node-1",
      "type": "trigger.manual",
      "label": "Start",
      "config": {},
      "outputs": { "success": "node-2", "error": "node-error" }
    },
    {
      "id": "node-2",
      "type": "data.tap.salesforce",
      "label": "Extract Opportunities",
      "config": {
        "username": "${vault.sf_username}",
        "password": "${vault.sf_password}",
        "security_token": "${vault.sf_token}",
        "query": "SELECT Id, Name, Amount, CloseDate FROM Opportunity WHERE StageName = 'Closed Won' AND CloseDate = THIS_MONTH",
        "domain": "login"
      },
      "outputs": { "success": "node-3", "error": "node-error" }
    },
    {
      "id": "node-3",
      "type": "data.target.snowflake",
      "label": "Load to Snowflake",
      "config": {
        "account": "${vault.snowflake_account}",
        "username": "${vault.snowflake_user}",
        "password": "${vault.snowflake_password}",
        "database": "SALES_DW",
        "schema": "PUBLIC",
        "warehouse": "COMPUTE_WH",
        "table": "opportunities",
        "records": "${Extract Opportunities.records}",
        "mode": "upsert"
      },
      "outputs": { "success": "node-4", "error": "node-error" }
    },
    {
      "id": "node-4",
      "type": "logging.log",
      "label": "Log Success",
      "config": {
        "message": "Synced ${Extract Opportunities.recordCount} opportunities to Snowflake. Inserted: ${Load to Snowflake.insertedCount}",
        "level": "INFO"
      },
      "outputs": { "success": null, "error": null }
    },
    {
      "id": "node-error",
      "type": "logging.log",
      "label": "Log Error",
      "config": {
        "message": "ETL failed: ${LAST_ERROR}",
        "level": "ERROR"
      },
      "outputs": { "success": null, "error": null }
    }
  ],
  "variables": {}
}
```

---

# Secrets Management - SkuldBot

Sistema de gestión de secretos empresariales que permite a los bots acceder a credenciales de forma segura sin exponer valores sensibles.

## Arquitectura de Secrets

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORCHESTRATOR                                    │
│                           (Cloud/On-premise)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  - Almacena Bot Packages (DSL compilado)                                    │
│  - NO almacena secrets (solo config de vault)                               │
│  - Triggers: Schedule | Webhook | Form                                       │
│  - Gestiona BotRunners registrados                                          │
│  - Autenticación por Key Token                                              │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │ Key Token                      │ Key Token                      │ Key Token
        ▼                                ▼                                ▼
┌───────────────────┐          ┌───────────────────┐          ┌───────────────────┐
│  BotRunner A      │          │  BotRunner B      │          │  BotRunner C      │
│  (Cliente ACME)   │          │  (Cliente XYZ)    │          │  (Cliente ABC)    │
├───────────────────┤          ├───────────────────┤          ├───────────────────┤
│ - En red cliente  │          │ - En red cliente  │          │ - En red cliente  │
│ - Acceso a:       │          │ - Acceso a:       │          │ - Acceso a:       │
│   • Azure KV      │          │   • AWS Secrets   │          │   • HashiCorp     │
│   • SQL Server    │          │   • PostgreSQL    │          │   • Oracle        │
│   • SharePoint    │          │   • S3            │          │   • SFTP interno  │
└───────────────────┘          └───────────────────┘          └───────────────────┘
```

**Principio clave**: Los secrets NUNCA salen del entorno del cliente. El BotRunner resuelve `${vault.xxx}` en runtime conectándose al vault del cliente.

## Nodos de Secrets

### secrets.azure_keyvault
Conectar a Azure Key Vault para cargar secretos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `vault_url` | text | URL del vault (ej: https://myvault.vault.azure.net) |
| `tenant_id` | text | Azure Tenant ID |
| `client_id` | text | Client ID del Service Principal |
| `use_managed_identity` | boolean | Usar Managed Identity en vez de Service Principal |
| `secrets` | textarea | Nombres de secrets a cargar (uno por línea) |

**Autenticación**: Via `AZURE_CLIENT_SECRET` en BotRunner o Managed Identity.

### secrets.aws_secrets
Conectar a AWS Secrets Manager.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `region` | select | Región AWS (us-east-1, eu-west-1, etc.) |
| `use_iam_role` | boolean | Usar IAM Role del EC2/ECS |
| `secrets` | textarea | ARNs o nombres de secrets (uno por línea) |

**Autenticación**: Via IAM Role o `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`.

### secrets.hashicorp_vault
Conectar a HashiCorp Vault.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `vault_addr` | text | URL del vault (ej: https://vault.example.com:8200) |
| `auth_method` | select | `token` o `approle` |
| `mount_point` | text | Mount point del secrets engine (default: secret) |
| `secrets_path` | text | Path dentro del secrets engine |
| `secrets` | textarea | Keys específicos a cargar (opcional) |

**Autenticación**: Via `VAULT_TOKEN` o (`VAULT_ROLE_ID` + `VAULT_SECRET_ID`).

### secrets.local_vault
Desbloquear vault local encriptado (AES-256-GCM).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `vault_path` | text | Path al vault (default: .skuldbot) |
| `secrets` | textarea | Secrets específicos a cargar (opcional) |

**Autenticación**: Via `SKULDBOT_VAULT_PASSWORD` en BotRunner.

## Variables de Salida

Los nodos de secrets cargan los secretos en variables globales `${vault.xxx}`:

```
${vault.db_password}        // Secret llamado "db_password"
${vault.api_key}            // Secret llamado "api_key"
${vault.connection_string}  // Secret llamado "connection_string"
```

Además, cada nodo produce metadata:

```
${Node Label.loaded}        // Número de secrets cargados
${Node Label.secretNames}   // Lista de nombres de secrets
```

## Variables de Entorno del BotRunner

| Vault Provider | Variable(s) de Entorno |
|----------------|------------------------|
| **Azure Key Vault** | `AZURE_CLIENT_SECRET` (o Managed Identity) |
| **AWS Secrets** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (o IAM Role) |
| **HashiCorp Vault** | `VAULT_TOKEN` o (`VAULT_ROLE_ID` + `VAULT_SECRET_ID`) |
| **Local Vault** | `SKULDBOT_VAULT_PASSWORD` |
| **Orchestrator** | `SKULDBOT_RUNNER_TOKEN` |

## Casos de Uso

### Caso 1: Azure Key Vault → SQL Server
```
[Azure Key Vault] ──> [Database: Connect] ──> [Database: Query]
     │                      │
     │ secrets:             │ host: ${vault.db_host}
     │   db_host            │ username: ${vault.db_user}
     │   db_user            │ password: ${vault.db_password}
     │   db_password        │
```

### Caso 2: Local Vault → Web Automation
```
[Local Vault] ──> [Web: Open] ──> [Web: Type] ──> [Web: Type] ──> [Web: Click]
     │                                │               │
     │ secrets:                       │ text:         │ text:
     │   portal_user                  │ ${vault.portal_user}  │ ${vault.portal_pass}
     │   portal_pass                  │
```

### Caso 3: AWS Secrets → Salesforce Tap
```
[AWS Secrets] ──> [Tap: Salesforce] ──> [Target: Snowflake]
     │                   │
     │ secrets:          │ username: ${vault.sf_user}
     │   sf_user         │ password: ${vault.sf_pass}
     │   sf_pass         │ security_token: ${vault.sf_token}
     │   sf_token        │
```

## Seguridad

1. **Secrets nunca salen del cliente**: El BotRunner conecta al vault local del cliente
2. **Key Token**: Cada BotRunner tiene un token único para autenticarse con el Orchestrator
3. **Encriptación**: Local Vault usa AES-256-GCM con PBKDF2
4. **Audit Log**: Todas las operaciones de vault se registran
5. **No en DSL**: Los valores de secrets nunca se guardan en el DSL, solo las referencias

## UI de Gestión (Local Vault)

El Studio incluye un panel para gestionar el vault local:

- **Crear vault**: Define master password
- **Unlock/Lock**: Bloquea/desbloquea el vault
- **Agregar secrets**: Name + Value + Description
- **Ver secrets**: Valores enmascarados (click para revelar)
- **Cambiar password**: Requiere password actual

## Archivos del Sistema

### Studio (TypeScript/React)

| Archivo | Descripción |
|---------|-------------|
| [studio/src/data/nodeTemplates.ts](../studio/src/data/nodeTemplates.ts) | 4 nodos de secrets |
| [studio/src/components/VaultManager.tsx](../studio/src/components/VaultManager.tsx) | UI de gestión de vault |
| [studio/src/store/vaultStore.ts](../studio/src/store/vaultStore.ts) | Estado Zustand del vault |
| [studio/src-tauri/src/main.rs](../studio/src-tauri/src/main.rs) | Comandos Tauri para vault |

### Engine (Python)

| Archivo | Descripción |
|---------|-------------|
| [engine/skuldbot/libs/vault.py](../engine/skuldbot/libs/vault.py) | Init Azure/AWS/HashiCorp Vault |
| [engine/skuldbot/libs/local_vault.py](../engine/skuldbot/libs/local_vault.py) | Local Vault (AES-256-GCM) |
| [engine/skuldbot/compiler/templates/main_v2.robot.j2](../engine/skuldbot/compiler/templates/main_v2.robot.j2) | Handlers para secrets.* |
| [engine/requirements.txt](../engine/requirements.txt) | azure-identity, hvac, boto3 |

---

# Control Flow - Nodos Contenedores

Los nodos de control de flujo en SkuldBot son **contenedores visuales** donde puedes arrastrar otros nodos dentro. Funcionan similar a los Group Nodes de n8n.

## Arquitectura de Contenedores

```
┌──────────────────────────────────────────────────────────────────┐
│  For Each                                    [config: items]     │  ← Header
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│     ┌────────────────┐      ┌────────────────┐                   │
│     │  Fill Form     │ ──── │   Submit       │   ← Nodos hijos   │
│     └────────────────┘      └────────────────┘                   │
│                                                                   │
│  ${item} = current item                                          │  ← Info de iteración
└──────────────────────────────────────────────────────────────────┘
         │
         ▼ (success/error después de todas las iteraciones)
```

## Tipos de Contenedores

| Tipo | Nodo | Color | Descripción |
|------|------|-------|-------------|
| `control.loop` | For Each | Púrpura | Itera sobre una colección |
| `control.while` | While Loop | Azul | Repite mientras condición sea true |
| `control.if` | If Condition | Ámbar | Ejecuta contenido si condición es true |
| `control.try_catch` | Try/Catch | Rojo | Manejo de errores con reintentos |

## control.loop (For Each)

Itera sobre cada elemento de una colección (array). Ideal para procesar resultados de queries o listas.

### Configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `items` | text | Sí | Array a iterar. Ej: `${Query.records}` |
| `item_var` | text | No | Nombre de la variable de iteración (default: `item`) |

### Variables de Salida

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `${For Each.index}` | number | Índice actual (0-based) |
| `${For Each.total}` | number | Total de elementos |
| `${For Each.isFirst}` | boolean | True si es primera iteración |
| `${For Each.isLast}` | boolean | True si es última iteración |

### Variable de Iteración

Dentro del loop, accede al elemento actual con `${item}` (o el nombre que configures):

```
${item}           // El elemento completo
${item.id}        // Campo 'id' del elemento
${item.name}      // Campo 'name' del elemento
```

### Ejemplo: Procesar registros de query

```
[Execute Query] ──> [For Each] ──> [siguiente nodo...]
                         │
                         │ items: ${Execute Query.records}
                         │ item_var: row
                         │
                    ┌────┴────┐
                    │ Dentro: │
                    │         │
                    │ [Fill]  │  ← usa ${row.name}, ${row.email}
                    │   │     │
                    │ [Submit]│
                    └─────────┘
```

## control.while (While Loop)

Repite mientras una condición sea verdadera. Incluye protección contra loops infinitos.

### Configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `condition` | text | Sí | Condición a evaluar. Ej: `${hasMore} == true` |
| `max_iterations` | number | No | Máximo de iteraciones (default: 100) |

### Variables de Salida

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `${While Loop.iteration}` | number | Iteración actual (1-based) |
| `${While Loop.total_iterations}` | number | Total de iteraciones ejecutadas |

### Ejemplo: Paginación de API

```
[Set hasMore = true] ──> [While Loop] ──> [Process Results]
                              │
                              │ condition: ${hasMore} == true
                              │ max_iterations: 50
                              │
                         ┌────┴────┐
                         │ Dentro: │
                         │         │
                         │ [API]   │  ← Fetch next page
                         │   │     │
                         │ [Set]   │  ← hasMore = response.hasNextPage
                         └─────────┘
```

## control.if (If Condition)

Ejecuta los nodos internos solo si la condición es verdadera.

### Configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `condition` | text | Sí | Condición a evaluar. Ej: `${count} > 10` |

### Variables de Salida

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `${If Condition.result}` | boolean | Resultado de la evaluación |

### Ejemplo: Validación condicional

```
[Get Count] ──> [If Condition] ──> [Continue...]
                     │
                     │ condition: ${Get Count.value} > 100
                     │
                ┌────┴────┐
                │ Dentro: │
                │         │
                │ [Send]  │  ← Solo si count > 100
                │ [Alert] │
                └─────────┘
```

## control.try_catch (Try/Catch)

Envuelve nodos para manejar errores. Puede reintentar automáticamente.

### Configuración

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `retry_count` | number | No | Número de reintentos (default: 0) |
| `retry_delay` | number | No | Segundos entre reintentos (default: 1) |

### Variables de Salida

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `${Try Catch.success}` | boolean | True si ejecutó sin errores |
| `${Try Catch.error_message}` | string | Mensaje de error (si falló) |
| `${Try Catch.retry_attempts}` | number | Intentos realizados |

### Ejemplo: API con reintentos

```
[Start] ──> [Try/Catch] ──> [Process Response]
                 │
                 │ retry_count: 3
                 │ retry_delay: 2
                 │
            ┌────┴────┐
            │ Dentro: │
            │         │
            │ [API]   │  ← Si falla, reintenta 3 veces
            │ [Parse] │
            └─────────┘
```

## Patrones Comunes

### Patrón 1: Transformación de Datos (Map)

Cuando necesitas transformar cada elemento de una colección y acumular los resultados, usa **For Each + Set Variable (append)**:

```
[Tap: SQL Server] ──> [Set: results = []] ──> [For Each] ──> [Target: Snowflake]
                                                   │               │
                                                   │               │ records: ${results}
                                                   │
                                              ┌────┴────┐
                                              │ Dentro: │
                                              │         │
                                              │ [Set]   │  ← transformed = {
                                              │   │     │      full_name: ${row.first} + ' ' + ${row.last},
                                              │   │     │      email: ${row.email}
                                              │   │     │    }
                                              │   │     │
                                              │ [Append]│  ← results.push(${transformed})
                                              └─────────┘
```

**Paso a paso:**

1. **Inicializar array vacío**: Antes del loop, usa `Set Variable` para crear `results = []`
2. **Transformar**: Dentro del loop, crea el objeto transformado con `Set Variable`
3. **Acumular**: Usa `Append to List` para agregar cada resultado a `results`
4. **Usar resultados**: Después del loop, `${results}` contiene todos los elementos transformados

### Patrón 2: Filtrado de Datos

Filtrar elementos que cumplan una condición:

```
[Query] ──> [Set: filtered = []] ──> [For Each] ──> [Process filtered]
                                          │               │
                                          │               │ usa ${filtered}
                                          │
                                     ┌────┴────┐
                                     │ [If]    │  ← condition: ${row.status} == 'active'
                                     │   │     │
                                     │ [Append]│  ← filtered.push(${row})
                                     └─────────┘
```

### Patrón 3: Agregación (Reduce)

Calcular un valor acumulado (suma, conteo, etc.):

```
[Query] ──> [Set: total = 0] ──> [For Each] ──> [Log total]
                                      │              │
                                      │              │ ${total}
                                      │
                                 ┌────┴────┐
                                 │ [Set]   │  ← total = ${total} + ${row.amount}
                                 └─────────┘
```

### Patrón 4: Lookup/Enriquecimiento

Enriquecer datos con información adicional de otra fuente:

```
[Query: Orders] ──> [For Each] ──> [Target: Enriched]
                         │               │
                         │               │ ${enriched_orders}
                         │
                    ┌────┴────┐
                    │ [API]   │  ← GET /customers/${row.customer_id}
                    │   │     │
                    │ [Set]   │  ← enriched = { ...${row}, customer_name: ${API.name} }
                    │   │     │
                    │ [Append]│  ← enriched_orders.push(${enriched})
                    └─────────┘
```

### Patrón 5: Batch Processing

Procesar en lotes para evitar timeouts o rate limits:

```
[Query] ──> [For Each] ──> [Done]
                 │
                 │ items: ${Query.records}
                 │
            ┌────┴────┐
            │ [API]   │  ← Procesa ${row}
            │   │     │
            │ [If]    │  ← ${For Each.index} % 100 == 0
            │   │     │
            │ [Wait]  │  ← Pausa 5 segundos cada 100 items
            └─────────┘
```

### Patrón 6: Error Handling por Item

Continuar procesando aunque un item falle:

```
[Query] ──> [Set: errors = []] ──> [For Each] ──> [Report errors]
                                        │              │
                                        │              │ ${errors}
                                        │
                                   ┌────┴────────────┐
                                   │ [Try/Catch]     │
                                   │      │          │
                                   │  ┌───┴───┐      │
                                   │  │[Process]     │  ← procesa ${row}
                                   │  └───────┘      │
                                   │      │          │
                                   │      │ error ───┼──> [Append] ← errors.push({ id: ${row.id}, error: ${Try Catch.error_message} })
                                   └─────────────────┘
```

## Nodos de Soporte para Patrones

| Nodo | Tipo | Descripción |
|------|------|-------------|
| **Set Variable** | `control.set` | Asigna un valor a una variable |
| **Append to List** | `control.append` | Agrega elemento a un array |
| **Wait** | `control.wait` | Pausa la ejecución N segundos |

## DSL Structure

Los nodos contenedores almacenan sus hijos en la propiedad `children`:

```json
{
  "id": "loop-1",
  "type": "control.loop",
  "config": {
    "items": "${Query.records}",
    "item_var": "row"
  },
  "children": [
    {
      "id": "fill-1",
      "type": "web.fill",
      "config": { "selector": "#name", "value": "${row.name}" },
      "outputs": { "success": "submit-1", "error": "END" }
    },
    {
      "id": "submit-1",
      "type": "web.click",
      "config": { "selector": "#submit" },
      "outputs": { "success": "END", "error": "END" }
    }
  ],
  "outputs": { "success": "next-node", "error": "error-handler" }
}
```

## Archivos del Sistema

### Studio (TypeScript/React)

| Archivo | Descripción |
|---------|-------------|
| [studio/src/components/GroupNode.tsx](../studio/src/components/GroupNode.tsx) | Componente visual de contenedores |
| [studio/src/components/FlowEditor.tsx](../studio/src/components/FlowEditor.tsx) | Registro de nodeTypes |
| [studio/src/types/flow.ts](../studio/src/types/flow.ts) | `CONTAINER_NODE_TYPES`, `isContainerNodeType()` |
| [studio/src/store/projectStore.ts](../studio/src/store/projectStore.ts) | Conversión DSL ↔ FlowNodes con children |
| [studio/src/data/nodeTemplates.ts](../studio/src/data/nodeTemplates.ts) | Definición de nodos contenedor |

### Engine (Python)

| Archivo | Descripción |
|---------|-------------|
| [engine/skuldbot/compiler/templates/main_v2.robot.j2](../engine/skuldbot/compiler/templates/main_v2.robot.j2) | Handlers para control.* |

---

**Versión**: 1.0
**Fecha**: Diciembre 2025
**Autor**: Equipo Khipus
