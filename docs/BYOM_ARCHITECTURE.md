# BYOM (Bring Your Own Model) - HIPAA Compliance Strategy

## 🎯 Critical Requirement

For HIPAA compliance in healthcare, insurance, and finance industries, **PHI/PII data MUST NOT be sent to external cloud LLMs** (OpenAI, Anthropic, etc.). 

**Solution: BYOM (Bring Your Own Model)**

## 🏗️ Architecture

### LLM Routing Strategy

```typescript
export enum LLMRoute {
  CLOUD = 'cloud',  // External LLMs (OpenAI, Anthropic) - ONLY for PUBLIC data
  BYOM = 'byom',    // Tenant's self-hosted LLM in their VPC - For PHI/PII
  LOCAL = 'local',  // Edge LLM on Runner - For offline scenarios
}
```

### Data Classification → LLM Routing

| Data Classification | Required Route | Reason |
|---------------------|----------------|---------|
| **PHI** (Protected Health Information) | `BYOM` or `LOCAL` | HIPAA compliance, BAA required |
| **PII** (Personally Identifiable Info) | `BYOM` or `LOCAL` | Privacy regulations (GDPR, CCPA) |
| **PCI** (Payment Card Industry) | `BYOM` or `LOCAL` | PCI-DSS compliance |
| **CONFIDENTIAL** | `BYOM` or `LOCAL` | Company policy |
| **INTERNAL** | `BYOM` or `CLOUD` | Can use cloud if BAA signed |
| **PUBLIC** | Any | No restrictions |

## 🔧 BYOM Configuration

### Supported Providers

1. **Ollama** (easiest, recommended for SMB)
   ```yaml
   provider: ollama
   endpoint: https://ollama.acme.internal:11434
   model: llama3:70b-instruct
   ```

2. **vLLM** (high performance, enterprise)
   ```yaml
   provider: vllm
   endpoint: https://llm.acme.internal:8000
   model: meta-llama/Llama-3-70b-instruct
   api_key: vllm-token-12345
   ```

3. **Text Generation Inference (TGI)** (HuggingFace)
   ```yaml
   provider: tgi
   endpoint: https://tgi.acme.internal:80
   model: meta-llama/Llama-3-70b-instruct
   ```

4. **llama.cpp** (CPU-optimized)
   ```yaml
   provider: llamacpp
   endpoint: https://llamacpp.acme.internal:8080
   model: llama-3-70b-q4_k_m
   ```

5. **Custom** (any OpenAI-compatible API)
   ```yaml
   provider: custom
   endpoint: https://custom-llm.acme.internal:443
   model: custom-model-v1
   api_key: custom-token
   headers:
     X-Custom-Header: value
   ```

## 📋 Implementation in Compliance Server

### New MCP Tools

#### 1. `configure_byom_llm`
Configure a tenant's self-hosted LLM endpoint:

```typescript
{
  name: 'configure_byom_llm',
  arguments: {
    tenantId: 'acme-insurance',
    config: {
      name: 'ACME Llama 3 70B',
      provider: 'ollama',
      endpoint: 'https://ollama.acme.internal:11434',
      model: 'llama3:70b-instruct',
      hipaaCompliant: true,
      dataResidency: 'us-east-1',
      baaRequired: true,
      capabilities: {
        chat: true,
        embedding: true,
        functionCalling: false
      }
    }
  }
}
```

#### 2. `list_byom_llms`
List all configured BYOM LLMs for a tenant:

```typescript
{
  name: 'list_byom_llms',
  arguments: {
    tenantId: 'acme-insurance'
  }
}
// Returns: [{ id, name, provider, endpoint, model, status: 'healthy' }]
```

#### 3. `test_byom_connection`
Test connectivity to a BYOM endpoint:

```typescript
{
  name: 'test_byom_connection',
  arguments: {
    tenantId: 'acme-insurance',
    configId: 'byom-config-123'
  }
}
// Returns: { success: true, latency: 120ms, model: 'llama3:70b' }
```

### Updated `route_llm_request`

Now returns BYOM endpoints for PHI/PII:

```typescript
// Before (old)
route_llm_request({ dataClassification: 'PHI' })
// Returns: { route: 'private', provider: 'local' }

// After (BYOM)
route_llm_request({ dataClassification: 'PHI' })
// Returns: {
//   route: 'byom',
//   provider: 'ollama',
//   endpoint: 'https://ollama.acme.internal:11434',
//   model: 'llama3:70b-instruct',
//   hipaaCompliant: true,
//   dataResidency: 'us-east-1'
// }
```

## 🏥 HIPAA Compliance Flow

### End-to-End Example: Claims Processing

```typescript
// Step 1: Classify incoming claim data
const classification = await classifyData({
  data: {
    patientName: 'John Doe',
    ssn: '123-45-6789',
    diagnosis: 'Type 2 Diabetes',
    claimAmount: 5000
  }
});
// Result: { level: 'PHI', fields: { patientName: 'PHI', ssn: 'PHI', ... } }

// Step 2: Route LLM based on classification
const route = await routeLLMRequest({
  dataClassification: 'PHI'
});
// Result: {
//   route: 'byom',
//   endpoint: 'https://ollama.acme.internal:11434',
//   model: 'llama3:70b-instruct',
//   hipaaCompliant: true
// }

// Step 3: Send to BYOM LLM (stays in tenant VPC)
const response = await fetch(route.endpoint, {
  method: 'POST',
  body: JSON.stringify({
    model: route.model,
    messages: [{ role: 'user', content: claimData }]
  })
});

// Step 4: Log audit trail
await logAuditEvent({
  action: 'llm_call',
  dataClassification: 'PHI',
  llmRoute: 'byom',
  endpoint: route.endpoint
});
```

## 🔐 Security & Compliance

### Data Residency
- **BYOM LLMs run in tenant's VPC** (AWS, Azure, GCP)
- PHI never leaves tenant's cloud environment
- Network isolation via VPC peering or private link

### Audit Trail
All LLM calls are logged:
```json
{
  "timestamp": "2026-01-27T19:00:00Z",
  "tenantId": "acme-insurance",
  "userId": "bot-user-123",
  "action": "llm_call",
  "dataClassification": "PHI",
  "route": "byom",
  "endpoint": "https://ollama.acme.internal:11434",
  "model": "llama3:70b-instruct",
  "tokenCount": 1500,
  "durationMs": 2300
}
```

### Business Associate Agreement (BAA)
- **Cloud LLMs (OpenAI, Anthropic):** Require BAA for PHI
- **BYOM:** No BAA needed (data never leaves tenant VPC)
- **Reduced legal risk** and faster compliance certification

## 📊 Cost Analysis

### Cloud LLMs (OpenAI GPT-4)
```
Cost: $30 per 1M input tokens
Monthly: $15,000 for 500M tokens
Risk: PHI exposure, BAA required
```

### BYOM (Llama 3 70B on AWS)
```
Infrastructure: ~$3,000/month (g5.12xlarge)
Tokens: Unlimited
Risk: Zero (data in tenant VPC)
Savings: $12,000/month + reduced compliance overhead
```

## 🚀 Deployment Scenarios

### 1. Small Practice (100-1000 claims/month)
**Recommendation:** Ollama on single GPU instance
```yaml
Provider: Ollama
Model: llama3:8b-instruct
Instance: AWS g5.xlarge ($1.50/hr)
Cost: ~$1,100/month
```

### 2. Mid-Size Insurer (10K-100K claims/month)
**Recommendation:** vLLM with load balancing
```yaml
Provider: vLLM
Model: llama3:70b-instruct
Instances: 3x g5.12xlarge (auto-scaling)
Cost: ~$9,000/month
```

### 3. Enterprise Health System (1M+ claims/month)
**Recommendation:** vLLM cluster with caching
```yaml
Provider: vLLM
Model: llama3:70b-instruct + specialized fine-tunes
Instances: 10x g5.48xlarge + Redis cache
Cost: ~$50,000/month (vs $300K with GPT-4)
```

## 📝 MCP Resource Schema

### BYOM LLM Configuration

```typescript
interface BYOMLLMConfig {
  id: string;                    // 'byom-config-123'
  tenantId: string;              // 'acme-insurance'
  name: string;                  // 'ACME Llama 3 70B'
  provider: 'ollama' | 'vllm' | 'tgi' | 'llamacpp' | 'custom';
  endpoint: string;              // 'https://ollama.acme.internal:11434'
  model: string;                 // 'llama3:70b-instruct'
  apiKey?: string;               // Optional authentication
  headers?: Record<string, string>; // Custom headers
  capabilities: {
    chat: boolean;
    embedding: boolean;
    functionCalling: boolean;
  };
  hipaaCompliant: boolean;       // true
  dataResidency: string;         // 'us-east-1'
  baaRequired: boolean;          // false (in tenant VPC)
  healthCheck: {
    status: 'healthy' | 'degraded' | 'down';
    lastCheck: string;           // ISO timestamp
    latencyMs: number;
    errorRate: number;
  };
  metadata?: Record<string, any>;
}
```

## ✅ Compliance Checklist

### HIPAA Requirements
- [x] PHI never sent to external cloud LLMs
- [x] Data stays in tenant's VPC
- [x] Complete audit trail for all LLM calls
- [x] Encryption in transit (TLS)
- [x] Encryption at rest (EBS volumes)
- [x] Access controls (IAM, RBAC)
- [x] Automatic session timeouts
- [x] Evidence pack generation for audits

### Implementation Status
- [x] BYOM architecture designed
- [x] LLM routing logic (`route_llm_request`)
- [x] Data classification (`classify_data`)
- [x] Audit logging (`log_audit_event`)
- [ ] BYOM configuration tools (to implement)
- [ ] Health check monitoring (to implement)
- [ ] Connection pooling (to implement)
- [ ] Failover to backup BYOM (to implement)

## 🎯 Next Steps

1. **Implement BYOM configuration tools**
   - `configure_byom_llm`
   - `list_byom_llms`
   - `test_byom_connection`

2. **Add health monitoring**
   - Periodic connectivity tests
   - Latency tracking
   - Automatic failover

3. **Create deployment guides**
   - Ollama setup guide
   - vLLM deployment (Kubernetes)
   - TGI configuration

4. **Build Studio UI**
   - BYOM configuration panel
   - Health status dashboard
   - Test connection button

5. **Update E2E tests**
   - BYOM configuration flow
   - PHI → BYOM routing validation
   - Failover scenarios

## 📚 References

- [Ollama Documentation](https://github.com/ollama/ollama)
- [vLLM Documentation](https://docs.vllm.ai/)
- [Text Generation Inference (TGI)](https://github.com/huggingface/text-generation-inference)
- [llama.cpp](https://github.com/ggerganov/llama.cpp)
- [HIPAA LLM Requirements](https://www.hhs.gov/hipaa/for-professionals/security/guidance/index.html)
- [OpenAI BAA](https://openai.com/policies/business-associate-addendum/)

---

**Status:** Architecture complete, ready for implementation  
**Priority:** P0 - Critical for HIPAA market entry  
**Estimated effort:** 2-3 days for full implementation

