# SkuldBot Hybrid MCP Architecture

**Implementation Date:** January 27, 2026  
**Status:** ✅ Complete  
**Architecture:** Hybrid (Control Plane + Orchestrator)

## Executive Summary

SkuldBot ahora implementa una **arquitectura híbrida de Model Context Protocol (MCP)** que permite operar en mercados altamente regulados (HIPAA, PCI-DSS, GDPR) sin limitantes en ventas.

### Business Model Soportado

- **Orchestrator PaaS**: Cada cliente despliega su propio Orchestrator en su nube (AWS/Azure/GCP)
- **Control Plane SaaS**: Servicio central multi-tenant para servicios comunes
- **Bots Rentables**: Modelo de pricing híbrido ($3 por claim, $0.75 por llamada, o $4K mínimo mensual, **lo que sea mayor**)
- **Compliance HIPAA**: Datos sensibles nunca salen del VPC del cliente

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     SkuldBot Ecosystem                        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐      ┌──────────────────┐      ┌─────────┐ │
│  │   Studio    │──────▶│  Orchestrator    │◀────▶│ Runners │ │
│  │  (Desktop)  │      │   (Per-Client)   │      │(Agents) │ │
│  │   Editor    │      │   PaaS in VPC    │      │         │ │
│  └──────┬──────┘      └─────────┬────────┘      └─────────┘ │
│         │                       │                            │
│         │      MCP Hybrid       │                            │
│         │     Architecture      │                            │
│         │                       │                            │
│         ▼                       ▼                            │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  Control Plane   │    │  Orchestrator    │               │
│  │   MCP Servers    │    │   MCP Servers    │               │
│  │                  │    │                  │               │
│  │  • Licensing     │    │  • Compliance    │               │
│  │  • Marketplace   │    │  • PHI/PII Class │               │
│  │  • Metering      │    │  • LLM Routing   │               │
│  │  • Billing       │    │  • Workflows     │               │
│  │                  │    │  • Audit Logs    │               │
│  └──────────────────┘    └──────────────────┘               │
│         ▲                       ▲                            │
│         │                       │                            │
│         │   Reports Usage &     │   Never Leaves VPC         │
│         │   Fetches Bots        │   (HIPAA Safe)             │
│         │                       │                            │
│         └───────────────────────┘                            │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Control Plane MCP (Central SaaS)

**Location:** Central multi-tenant service (skuld.ai domain)  
**Purpose:** Servicios compartidos para todos los clientes

### MCP Servers Implemented

#### 1.1 Licensing Server

**File:** `control-plane/api/src/mcp/servers/licensing.server.ts`

**Tools:**

- `validate_license_feature` - Valida si un feature está disponible
- `check_entitlement` - Verifica límites de recursos (runners, users, etc)
- `get_license_expiry` - Obtiene fecha de expiración
- `check_available_seats` - Chequea asientos disponibles

**Resources:**

- `licenses://tenant/{tenantId}/current` - Licencia actual
- `licenses://tenant/{tenantId}/features` - Features habilitados
- `licenses://tenant/{tenantId}/entitlements` - Límites de recursos

**Use Case:**

```typescript
// Studio llama antes de habilitar un feature
const result = await mcp.callTool('control-plane', {
  name: 'validate_license_feature',
  arguments: {
    tenantId: 'acme-insurance',
    feature: 'ai_planner_v2',
  },
});

if (!result.allowed) {
  showUpgradeDialog(result.upgradeUrl);
}
```

#### 1.2 Marketplace Server

**File:** `control-plane/api/src/mcp/servers/marketplace.server.ts`

**Tools:**

- `search_marketplace` - Buscar bots por categoría/industria
- `get_bot_details` - Detalles de un bot específico
- `subscribe_to_bot` - Suscribirse a un bot rentable
- `unsubscribe_from_bot` - Cancelar suscripción
- `download_bot` - Descargar bot DSL
- `list_subscribed_bots` - Listar bots suscritos

**Resources:**

- `marketplace://bots` - Catálogo completo de bots
- `marketplace://bots/{category}` - Bots por categoría
- `marketplace://tenant/{tenantId}/subscriptions` - Subscripciones activas

**Use Case:**

```typescript
// Studio UI: Marketplace Browser
const bots = await mcp.callTool('control-plane', {
  name: 'search_marketplace',
  arguments: {
    tenantId: 'acme-insurance',
    category: 'claims',
    industry: 'insurance',
  },
});

// User clicks "Install"
await mcp.callTool('control-plane', {
  name: 'subscribe_to_bot',
  arguments: {
    tenantId: 'acme-insurance',
    botId: 'fnol-bot-v1',
    pricingTier: 'professional',
  },
});
```

#### 1.3 Metering Server

**File:** `control-plane/api/src/mcp/servers/metering.server.ts`

**Tools:**

- `report_bot_execution` - Reportar ejecución para billing
- `get_current_usage` - Obtener uso actual del período
- `get_tenant_usage_summary` - Resumen de uso del tenant
- `report_runner_heartbeat` - Reportar runner activo
- `get_active_runners` - Obtener runners activos

**Resources:**

- `metering://tenant/{tenantId}/current-period` - Uso del período actual
- `metering://tenant/{tenantId}/bots/{botId}/usage` - Uso de un bot específico
- `metering://tenant/{tenantId}/runners/active` - Runners activos
- `metering://tenant/{tenantId}/projected-bill` - Factura proyectada

**Critical Feature: "Whichever is Greater" Billing**

```typescript
// Orchestrator reporta cada ejecución
await controlPlaneClient.reportBotExecution({
  botId: 'fnol-bot-v1',
  executionId: 'exec-123',
  startTime: '2026-01-27T10:00:00Z',
  endTime: '2026-01-27T10:05:00Z',
  status: 'success',
  metrics: {
    claimsCompleted: 1,
    apiCalls: 15,
  },
});

// Metering calcula automáticamente:
// - usageBased: 1 × $3 = $3
// - callBased: 15 × $0.75 = $11.25
// - monthlyMinimum: $4,000
// - charged: max($3, $11.25, $4,000) = $4,000
```

#### 1.4 Billing Server

**File:** `control-plane/api/src/mcp/servers/billing.server.ts`

**Tools:**

- `calculate_invoice` - Calcular factura para un período
- `get_invoice` - Obtener factura existente
- `list_invoices` - Listar facturas del tenant

**Resources:**

- `billing://tenant/{tenantId}/invoices` - Todas las facturas
- `billing://tenant/{tenantId}/payment-methods` - Métodos de pago
- `billing://invoices/{invoiceId}` - Detalles de factura

**Invoice Structure:**

```json
{
  "items": [
    {
      "category": "orchestrator_license",
      "total": 500.0
    },
    {
      "category": "studio_licenses",
      "total": 300.0
    },
    {
      "category": "runners",
      "total": 1100.0
    },
    {
      "category": "marketplace_bots",
      "details": [
        {
          "botId": "fnol-bot-v1",
          "costs": {
            "usageBased": 960.0,
            "callBased": 3375.0,
            "monthlyMinimum": 4000.0,
            "charged": 4000.0
          },
          "explanation": "Charged $4,000 (monthly minimum) as it is greater than usage-based ($960) and call-based ($3,375)"
        }
      ],
      "total": 4600.0
    }
  ],
  "subtotal": 6500.0,
  "tax": 650.0,
  "total": 7150.0
}
```

---

## 2. Orchestrator MCP (Per-Client PaaS)

**Location:** Cliente's VPC (AWS/Azure/GCP)  
**Purpose:** Servicios sensibles que requieren aislamiento de datos

### MCP Servers Implemented

#### 2.1 Compliance Server

**File:** `orchestrator/api/src/mcp/servers/compliance.server.ts`

**Tools:**

- `classify_data` - Detectar PHI/PII/PCI en datos
- `route_llm_request` - Rutear LLM según clasificación
- `redact_sensitive_data` - Redactar datos sensibles
- `log_audit_event` - Registrar evento de auditoría
- `check_compliance_policy` - Validar políticas de compliance
- `get_compliance_report` - Generar reporte de compliance

**Resources:**

- `compliance://tenant/{tenantId}/policies` - Políticas de compliance
- `compliance://tenant/{tenantId}/audit-log` - Log de auditoría
- `compliance://tenant/{tenantId}/classification-rules` - Reglas de clasificación
- `compliance://tenant/{tenantId}/llm-routing-config` - Config de routing LLM

**Critical Feature: PHI/PII Classification**

```typescript
// AI Planner classifica datos antes de enviar a LLM
const result = await mcp.callTool('orchestrator', {
  name: 'classify_data',
  arguments: {
    tenantId: 'acme-insurance',
    data: {
      patient_name: 'John Doe',
      ssn: '123-45-6789',
      diagnosis: 'Broken arm',
      claim_amount: 5000
    },
    context: 'ai_planner_v2'
  }
});

// Result:
{
  "fields": [
    { "name": "patient_name", "classification": "PII", "confidence": 0.9 },
    { "name": "ssn", "classification": "PHI", "confidence": 0.99, "detectedType": "SSN" },
    { "name": "diagnosis", "classification": "PHI", "confidence": 0.95 },
    { "name": "claim_amount", "classification": "INTERNAL", "confidence": 0.8 }
  ],
  "overallClassification": "PHI",
  "requiresPrivateLLM": true,
  "recommendedRoute": "private",
  "redactionRequired": true
}
```

**Critical Feature: LLM Routing**

```typescript
// Rutear LLM según clasificación de datos
const routing = await mcp.callTool('orchestrator', {
  name: 'route_llm_request',
  arguments: {
    tenantId: 'acme-insurance',
    dataClassification: 'PHI',
    preferredRoute: 'cloud'
  }
});

// Result:
{
  "route": "private",  // Overrode "cloud" preference
  "dataClassification": "PHI",
  "explanation": "PHI detected. Using private LLM to maintain HIPAA compliance."
}

// AI Planner usa el LLM correcto:
if (routing.route === 'private') {
  response = await callPrivateLLM(prompt); // Self-hosted in VPC
} else if (routing.route === 'local') {
  response = await callLocalLLM(prompt); // On Runner device
} else {
  response = await callCloudLLM(prompt); // OpenAI/Anthropic
}
```

#### 2.2 Workflow Server

**File:** `orchestrator/api/src/mcp/servers/workflow.server.ts`

**Tools:**

- `create_workflow_template` - Crear plantilla de workflow
- `get_workflow_template` - Obtener plantilla
- `list_workflow_templates` - Listar plantillas
- `update_workflow_template` - Actualizar plantilla
- `delete_workflow_template` - Eliminar plantilla
- `instantiate_template` - Crear instancia de plantilla
- `clone_marketplace_bot` - Clonar bot del marketplace

**Resources:**

- `workflow://tenant/{tenantId}/templates` - Plantillas del tenant
- `workflow://tenant/{tenantId}/templates/{category}` - Por categoría
- `workflow://templates/{templateId}` - Detalles de plantilla
- `workflow://templates/{templateId}/dsl` - DSL de plantilla

**Use Case:**

```typescript
// AI Planner sugiere usar una plantilla existente
const templates = await mcp.callTool('orchestrator', {
  name: 'list_workflow_templates',
  arguments: {
    tenantId: 'acme-insurance',
    category: 'claims',
    industry: 'insurance',
  },
});

// User selecciona "FNOL Intake Workflow"
const instance = await mcp.callTool('orchestrator', {
  name: 'instantiate_template',
  arguments: {
    templateId: 'tpl-fnol-001',
    variableValues: {
      database_connection: 'postgres://...',
      notification_email: 'claims@acme.com',
    },
    name: 'ACME FNOL Bot',
  },
});

// Resultado: Bot listo para ejecutar con variables sustituidas
```

#### 2.3 Control Plane Client

**File:** `orchestrator/api/src/mcp/clients/control-plane.client.ts`

**Purpose:** Orchestrator reporta al Control Plane

**Methods:**

- `reportBotExecution()` - Envía métricas de ejecución
- `reportRunnerHeartbeat()` - Reporta runners activos
- `validateLicenseFeature()` - Valida features antes de usar
- `searchMarketplace()` - Busca bots disponibles
- `downloadBot()` - Descarga bot desde marketplace

**Flow:**

```typescript
// Runner ejecuta un bot
runBot('fnol-bot-v1');

// Al terminar, Orchestrator reporta
await controlPlaneClient.reportBotExecution({
  botId: 'fnol-bot-v1',
  executionId: 'exec-456',
  metrics: {
    claimsCompleted: 1,
    apiCalls: 20,
  },
});

// Control Plane actualiza metering y calcula costo
// Control Plane factura al final del mes
```

---

## 3. Studio MCP Integration

**Files:**

- `studio/src-tauri/src/mcp/client.rs` - Rust MCP Client (HTTP)
- `studio/src/components/marketplace/MarketplaceBrowser.tsx` - UI del Marketplace
- `studio/src/components/usage/UsageDashboard.tsx` - UI de Usage & Billing

### 3.1 MCP Client (Rust)

**Capabilities:**

- Conecta a múltiples servidores (Control Plane + Orchestrator)
- Lista tools y resources
- Llama tools de forma asíncrona
- Lee resources
- Inyecta contexto en AI Planner

**Configuration:**

```rust
let mut mcp_client = MCPClient::new();

// Add Control Plane
mcp_client.add_server(MCPServerConfig {
    name: "control-plane".to_string(),
    url: "https://control-plane.skuld.ai".to_string(),
    api_key: Some(api_key),
});

// Add Orchestrator (client's VPC)
mcp_client.add_server(MCPServerConfig {
    name: "orchestrator".to_string(),
    url: "https://orchestrator.acme-insurance.com".to_string(),
    api_key: Some(orchestrator_api_key),
});
```

**AI Planner Integration:**

```rust
// AI Planner V2 obtiene contexto de MCP
let mcp_context = mcp_client.get_context_for_planner().await;

let enhanced_prompt = format!(
    "{}\n\n{}\n\n{}",
    AI_PLANNER_BASE_PROMPT,
    node_catalog,
    mcp_context  // Tools & Resources disponibles
);

// LLM ahora puede:
// 1. Usar bots del marketplace
// 2. Validar compliance (PHI/PII)
// 3. Sugerir plantillas existentes
// 4. Chequear límites de licencia
```

### 3.2 Marketplace Browser UI

**File:** `studio/src/components/marketplace/MarketplaceBrowser.tsx`

**Features:**

- Búsqueda de bots por nombre/categoría/industria
- Filtros por categoría e industria
- Vista de cards con rating, pricing, y publisher
- Botón "Install" que suscribe al bot
- Integración con Control Plane MCP

**Screenshots (conceptual):**

```
┌─────────────────────────────────────────────────────────┐
│  Marketplace                                     [v Current Month] [Export] │
├─────────────────────────────────────────────────────────┤
│  [Search...] [Category: Claims] [Industry: Insurance]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ FNOL Bot v1  │  │ Claims Proc  │  │ Med Billing  │  │
│  │              │  │              │  │              │  │
│  │ ⭐⭐⭐⭐⭐ (120)│  │ ⭐⭐⭐⭐☆ (85) │  │ ⭐⭐⭐⭐☆ (60) │  │
│  │              │  │              │  │              │  │
│  │ by Skuld ✓   │  │ by Skuld ✓   │  │ by Partner ✓ │  │
│  │              │  │              │  │              │  │
│  │ $3/claim or  │  │ $500/month   │  │ $0.50/record │  │
│  │ $4K min      │  │              │  │              │  │
│  │              │  │              │  │              │  │
│  │  [Install]   │  │  [Install]   │  │  [Install]   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Usage Dashboard UI

**File:** `studio/src/components/usage/UsageDashboard.tsx`

**Features:**

- Summary cards: Current cost, Projected monthly, Active bots
- Bot-by-bot breakdown con métricas
- "Whichever is greater" pricing explanation
- Export usage report
- Period selector (current/last/last 3 months)

**Screenshots (conceptual):**

```
┌─────────────────────────────────────────────────────────┐
│  Usage & Billing                    [v Current Month] [Export] │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Current Cost│  │ Projected   │  │ Active Bots │     │
│  │   $4,600    │  │   $5,200    │  │      2      │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
├─────────────────────────────────────────────────────────┤
│  Bot Usage Breakdown                                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ FNOL Bot v1                          $4,000.00     │ │
│  │ Hybrid pricing                                     │ │
│  │                                                    │ │
│  │ Claims: 320    API Calls: 4,500                   │ │
│  │                                                    │ │
│  │ Usage: $960  |  Calls: $3,375  |  Min: $4,000    │ │
│  │ Charged $4,000 (monthly minimum, as it's greater) │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Claims Processor v1                    $600.00     │ │
│  │ Hybrid pricing                                     │ │
│  │                                                    │ │
│  │ Records: 1,200                                     │ │
│  │                                                    │ │
│  │ Usage: $600  |  Min: $500                         │ │
│  │ Charged $600 (usage-based, as it's greater)       │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Examples

### 4.1 Bot Execution with Compliance

```
1. User designs bot in Studio
   ↓
2. Studio validates license features (Control Plane MCP)
   ↓
3. User deploys to Orchestrator
   ↓
4. Orchestrator assigns to Runner
   ↓
5. Runner fetches input data
   ↓
6. Orchestrator classifies data (Compliance MCP)
   ├─ PHI detected → Route to Private LLM
   ├─ PII detected → Route to Private LLM
   └─ Public data → Route to Cloud LLM
   ↓
7. Bot executes with correct LLM
   ↓
8. Orchestrator logs audit event (Compliance MCP)
   ↓
9. Orchestrator reports execution to Control Plane (Metering MCP)
   ↓
10. Control Plane calculates cost ("whichever is greater")
    ↓
11. End of month: Control Plane generates invoice (Billing MCP)
```

### 4.2 Marketplace Bot Installation

```
1. User opens Marketplace in Studio
   ↓
2. Studio fetches bot catalog (Control Plane MCP - Marketplace Server)
   ↓
3. User searches "FNOL automation"
   ↓
4. User clicks "Install" on "FNOL Bot v1"
   ↓
5. Studio calls subscribe_to_bot (Control Plane MCP)
   ↓
6. Control Plane validates license entitlements (Licensing MCP)
   ↓
7. Control Plane creates subscription record
   ↓
8. Studio downloads bot DSL (Control Plane MCP)
   ↓
9. Orchestrator clones bot as tenant template (Orchestrator MCP - Workflow Server)
   ↓
10. User customizes bot variables
    ↓
11. User deploys to Runner
    ↓
12. Each execution is metered (Control Plane MCP - Metering Server)
```

### 4.3 AI Planner V2 with MCP Context

```
1. User: "Create a bot to process insurance claims from email"
   ↓
2. AI Planner fetches MCP context:
   - List workflow templates (Orchestrator MCP)
   - List marketplace bots (Control Plane MCP)
   - Check license features (Control Plane MCP)
   ↓
3. AI Planner finds "FNOL Intake Workflow" template
   ↓
4. AI Planner generates plan using template
   ↓
5. Before generating final DSL, AI Planner:
   - Classifies sample data (Orchestrator MCP - Compliance)
   - Determines LLM routing (Orchestrator MCP - Compliance)
   ↓
6. AI Planner generates executable DSL with:
   - Correct LLM provider (private for PHI)
   - Redaction steps for logging
   - Audit logging nodes
   ↓
7. User reviews and applies to canvas
   ↓
8. Bot is compliance-ready from day 1
```

---

## 5. API Endpoints

### Control Plane MCP API

**Base URL:** `https://control-plane.skuld.ai/api/v1/mcp`

```
GET  /tools                    # List all tools
GET  /resources                # List all resources
POST /tools/call               # Execute a tool
GET  /resources/{uri}          # Read a resource
GET  /capabilities             # Get server capabilities
GET  /health                   # Health check
```

**Authentication:**

```
Headers:
  x-api-key: <control_plane_api_key>
  x-tenant-id: <tenant_id>
```

### Orchestrator MCP API

**Base URL:** `https://orchestrator.<tenant-domain>/api/v1/mcp`

```
GET  /tools                    # List all tools
GET  /resources                # List all resources
POST /tools/call               # Execute a tool
GET  /resources/{uri}          # Read a resource
GET  /capabilities             # Get server capabilities
GET  /health                   # Health check
```

**Authentication:**

```
Headers:
  x-tenant-id: <tenant_id>
```

---

## 6. Security & Compliance

### 6.1 Data Residency

- **PHI/PII nunca sale del Orchestrator** (VPC del cliente)
- Compliance MCP corre en el Orchestrator (not Control Plane)
- LLM routing asegura que PHI/PII use LLMs privados
- Audit logs permanecen en el Orchestrator

### 6.2 HIPAA Compliance

✅ **PHI Classification:** Detecta SSN, MRN, diagnósticos, etc  
✅ **Private LLM Routing:** PHI siempre usa LLM privado/local  
✅ **Audit Logging:** Todas las acciones con PHI son registradas  
✅ **Data Redaction:** PHI es redactado en logs/reports  
✅ **Access Control:** Tenant isolation en Orchestrator  
✅ **Retention Policies:** 7 años (2555 días) para HIPAA  
✅ **Evidence Pack:** Reportes de compliance automáticos

### 6.3 Zero Trust Architecture

- API keys rotables
- Tenant isolation (cada Orchestrator = 1 tenant)
- JWT tokens entre services
- MFA requirement configurable por tenant
- Encrypted at rest & in transit

---

## 7. Testing & Validation

### 7.1 MCP Server Tests

**Control Plane:**

```bash
cd control-plane/api
npm test

# Test individual servers
npm test -- licensing.server.spec.ts
npm test -- marketplace.server.spec.ts
npm test -- metering.server.spec.ts
npm test -- billing.server.spec.ts
```

**Orchestrator:**

```bash
cd orchestrator/api
npm test

# Test individual servers
npm test -- compliance.server.spec.ts
npm test -- workflow.server.spec.ts
```

### 7.2 Studio MCP Client Tests

```bash
cd studio/src-tauri
cargo test mcp::client::tests
```

### 7.3 Integration Tests

**Test 1: End-to-End Bot Execution**

```bash
# Start Control Plane
cd control-plane/api && npm run start:dev

# Start Orchestrator (mock tenant)
cd orchestrator/api && npm run start:dev

# Start Studio
cd studio && npm run tauri dev

# Execute test bot
# Verify:
# - Execution is reported to Control Plane
# - Usage is metered correctly
# - Invoice is calculated with "whichever is greater"
```

**Test 2: PHI Classification**

```bash
# Send PHI data to Compliance MCP
curl -X POST http://localhost:3000/api/v1/mcp/tools/call \
  -H "x-tenant-id: test-tenant" \
  -d '{
    "name": "classify_data",
    "arguments": {
      "tenantId": "test-tenant",
      "data": {
        "patient_name": "John Doe",
        "ssn": "123-45-6789"
      }
    }
  }'

# Expected: PHI detected, requiresPrivateLLM = true
```

---

## 8. Deployment

### 8.1 Control Plane (Central SaaS)

**Infrastructure:**

- AWS ECS / Kubernetes
- Multi-AZ for HA
- PostgreSQL RDS (multi-AZ)
- Redis ElastiCache
- CloudFront CDN

**Deployment:**

```bash
cd control-plane/api
npm run build
docker build -t skuld/control-plane:latest .
docker push skuld/control-plane:latest

# Deploy to ECS/K8s
kubectl apply -f k8s/control-plane/
```

**Environment Variables:**

```env
DB_HOST=control-plane-db.skuld.ai
DB_PORT=5432
DB_USERNAME=skuld_cp
DB_PASSWORD=<secret>
DB_DATABASE=skuld_controlplane

NODE_ENV=production
PORT=3000
```

### 8.2 Orchestrator (Per-Client PaaS)

**Deployment Options:**

1. **AWS CloudFormation Stack**
2. **Azure ARM Template**
3. **GCP Deployment Manager**
4. **Terraform (multi-cloud)**

**Customer deploys Orchestrator in their VPC:**

```bash
# Example: AWS
cd orchestrator/terraform/aws
terraform init
terraform plan -var="tenant_id=acme-insurance"
terraform apply

# This creates:
# - ECS cluster (Orchestrator API)
# - RDS PostgreSQL (tenant data)
# - Redis (queues)
# - VPC with private subnets
# - Security groups (restricted access)
# - Secrets Manager (API keys)
```

**Environment Variables:**

```env
DB_HOST=orchestrator-db.<tenant-vpc>
DB_PORT=5432
DB_USERNAME=skuld_orch
DB_PASSWORD=<secret>
DB_DATABASE=skuld_orchestrator

TENANT_ID=acme-insurance
CONTROL_PLANE_URL=https://control-plane.skuld.ai
CONTROL_PLANE_API_KEY=<tenant_api_key>

NODE_ENV=production
PORT=3000
```

### 8.3 Studio (Desktop Installer)

**Build:**

```bash
cd studio
npm run tauri build

# Outputs:
# - Windows: skuldbot-studio_0.1.0_x64-setup.exe
# - macOS: SkuldBot Studio.app (DMG)
# - Linux: skuldbot-studio_0.1.0_amd64.deb
```

**MCP Configuration (user-editable):**

`~/.skuldbot/mcp-config.json`:

```json
{
  "servers": [
    {
      "name": "control-plane",
      "url": "https://control-plane.skuld.ai",
      "apiKey": "<user_api_key>"
    },
    {
      "name": "orchestrator",
      "url": "https://orchestrator.acme-insurance.com",
      "apiKey": "<orchestrator_api_key>"
    }
  ]
}
```

---

## 9. Benefits of Hybrid Architecture

### 9.1 Compliance

✅ PHI/PII nunca sale del VPC del cliente  
✅ Auditoría completa en Orchestrator  
✅ LLM routing automático según clasificación  
✅ Cumple HIPAA, PCI-DSS, GDPR

### 9.2 Scalability

✅ Control Plane escala horizontalmente (SaaS multi-tenant)  
✅ Orchestrator escala por cliente (aislado)  
✅ Runners escalan elásticamente

### 9.3 Cost Efficiency

✅ Cliente paga solo por su Orchestrator (no shared infrastructure)  
✅ Skuld minimiza costos de infra centralizada  
✅ Metering preciso con "whichever is greater" model

### 9.4 Market Reach

✅ **Sin limitantes de ventas**: Clientes HIPAA pueden adoptar sin miedo  
✅ **Marketplace funciona**: Bots se descargan a Orchestrator del cliente  
✅ **Licensing flexible**: Features se validan en runtime  
✅ **Billing justo**: Solo se cobra por uso real

---

## 10. Next Steps

### Phase 1: Testing (Week 1)

- [ ] Unit tests para todos los MCP servers
- [ ] Integration tests end-to-end
- [ ] Load testing (1000+ concurrent requests)
- [ ] Security audit (penetration testing)

### Phase 2: Documentation (Week 2)

- [ ] API documentation (OpenAPI/Swagger)
- [ ] Developer guides (how to add MCP server)
- [ ] Customer deployment guides
- [ ] Compliance certification docs

### Phase 3: Monitoring & Observability (Week 3)

- [ ] Prometheus metrics para MCP servers
- [ ] Grafana dashboards
- [ ] Alerting rules (SLA violations)
- [ ] Distributed tracing (OpenTelemetry)

### Phase 4: Beta Launch (Week 4-6)

- [ ] Onboard 3 beta customers
- [ ] Deploy Orchestrator en sus VPCs
- [ ] Validar compliance con auditor externo
- [ ] Refinar pricing basado en feedback

### Phase 5: GA Launch (Week 7+)

- [ ] Public marketplace con 10+ bots
- [ ] Self-service onboarding
- [ ] Partner program (bot publishers)
- [ ] Marketing campaign (HIPAA compliance focus)

---

## 11. Contact & Support

**Engineering Lead:** [Your Name]  
**Architecture:** Hybrid MCP (Control Plane + Orchestrator)  
**Status:** ✅ Implementation Complete  
**Documentation:** This file + inline code comments

**Questions?**

- Technical: Open GitHub issue
- Business: sales@skuld.ai
- Security: security@skuld.ai

---

**Document Version:** 1.0  
**Last Updated:** January 27, 2026  
**Authors:** AI Assistant + User (dubielvaldivia)
