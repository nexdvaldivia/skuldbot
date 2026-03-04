# BYOM Connectors - Universal LLM Integration

## 🎯 True BYOM = Client's Choice of ANY LLM

BYOM no es solo Ollama. Es dar al cliente **total libertad** de usar cualquier LLM que ya tengan o prefieran, con BAAs existentes o self-hosted.

---

## 🔌 Supported Connectors (12+)

### Cloud Providers with BAA Support

#### 1. **Azure AI Foundry** (Microsoft)
```yaml
provider: azure-ai-foundry
endpoint: https://your-resource.openai.azure.com
api_key: ${AZURE_OPENAI_KEY}
api_version: 2024-02-15-preview
deployment_name: gpt-4-turbo
baa_signed: true
hipaa_compliant: true
data_residency: us-east-1
```

**Models Available:**
- GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
- Claude 3 (Sonnet, Opus, Haiku)
- Llama 3 70B, Mistral Large
- Phi-3, Command R+

**Pricing:** $0.01-0.06/1K tokens  
**BAA:** Available (Azure HIPAA compliance)  
**Setup Time:** 10 minutes

---

#### 2. **AWS Bedrock** (Amazon)
```yaml
provider: aws-bedrock
region: us-east-1
model_id: anthropic.claude-3-sonnet-20240229-v1:0
aws_access_key: ${AWS_ACCESS_KEY}
aws_secret_key: ${AWS_SECRET_KEY}
baa_signed: true
hipaa_compliant: true
```

**Models Available:**
- Claude 3 (Opus, Sonnet, Haiku)
- Llama 3 70B/8B
- Mistral Large/7B
- Cohere Command R+
- Amazon Titan

**Pricing:** $0.003-0.024/1K tokens  
**BAA:** Available (AWS HIPAA eligible)  
**Setup Time:** 15 minutes

---

#### 3. **Google Vertex AI** (GCP)
```yaml
provider: vertex-ai
project_id: your-project-id
location: us-central1
model: claude-3-sonnet@20240229
credentials_file: /path/to/service-account.json
baa_signed: true
hipaa_compliant: true
```

**Models Available:**
- Gemini 1.5 Pro/Flash
- Claude 3 (Opus, Sonnet)
- Llama 3 70B
- PaLM 2

**Pricing:** $0.00025-0.0125/1K tokens  
**BAA:** Available (GCP HIPAA compliance)  
**Setup Time:** 15 minutes

---

#### 4. **OpenAI** (with BAA)
```yaml
provider: openai
endpoint: https://api.openai.com/v1
api_key: ${OPENAI_API_KEY}
model: gpt-4-turbo-preview
organization_id: org-xxx
baa_signed: true  # Enterprise only
hipaa_compliant: true  # With BAA
```

**Models Available:**
- GPT-4 Turbo, GPT-4, GPT-3.5 Turbo

**Pricing:** $0.01-0.12/1K tokens  
**BAA:** Available (Enterprise plan)  
**Setup Time:** 5 minutes

---

#### 5. **Anthropic** (with BAA)
```yaml
provider: anthropic
endpoint: https://api.anthropic.com/v1
api_key: ${ANTHROPIC_API_KEY}
model: claude-3-opus-20240229
baa_signed: true  # Enterprise only
hipaa_compliant: true  # With BAA
```

**Models Available:**
- Claude 3 (Opus, Sonnet, Haiku)

**Pricing:** $0.003-0.075/1K tokens  
**BAA:** Available (Enterprise plan)  
**Setup Time:** 5 minutes

---

### Self-Hosted Options (No BAA Needed)

#### 6. **Ollama** (Easiest)
```yaml
provider: ollama
endpoint: http://localhost:11434
model: llama3:70b-instruct
baa_required: false
hipaa_compliant: true  # Data never leaves VPC
data_residency: local
```

**Models Available:** 100+ (Llama, Mistral, Phi, CodeLlama, etc.)  
**Cost:** Infrastructure only (~$1.1K-3K/mo)  
**Setup Time:** 5 minutes

---

#### 7. **vLLM** (High Performance)
```yaml
provider: vllm
endpoint: https://vllm.internal:8000
api_key: vllm-token-xxx
model: meta-llama/Llama-3-70b-instruct
baa_required: false
hipaa_compliant: true
data_residency: us-east-1
```

**Models Available:** HuggingFace models  
**Cost:** Infrastructure only (~$3K-50K/mo)  
**Setup Time:** 30 minutes

---

#### 8. **Text Generation Inference (TGI)** (HuggingFace)
```yaml
provider: tgi
endpoint: https://tgi.internal:80
model: meta-llama/Llama-3-70b-instruct-hf
headers:
  Authorization: Bearer ${TGI_TOKEN}
baa_required: false
hipaa_compliant: true
```

**Models Available:** HuggingFace models  
**Cost:** Infrastructure only  
**Setup Time:** 30 minutes

---

#### 9. **llama.cpp** (CPU-Optimized)
```yaml
provider: llamacpp
endpoint: http://localhost:8080
model: llama-3-70b-q4_k_m.gguf
baa_required: false
hipaa_compliant: true
data_residency: local
```

**Models Available:** GGUF quantized models  
**Cost:** CPU infrastructure (~$500/mo)  
**Setup Time:** 15 minutes

---

#### 10. **LM Studio** (Developer Tool)
```yaml
provider: lmstudio
endpoint: http://localhost:1234/v1
model: llama-3-8b-instruct
baa_required: false
hipaa_compliant: true
data_residency: local
```

**Models Available:** Popular open-source models  
**Cost:** Free (local only)  
**Setup Time:** 2 minutes

---

#### 11. **LocalAI** (OpenAI Compatible)
```yaml
provider: localai
endpoint: http://localhost:8080
model: llama3-8b
api_key: optional
baa_required: false
hipaa_compliant: true
```

**Models Available:** Multi-backend support  
**Cost:** Infrastructure only  
**Setup Time:** 15 minutes

---

#### 12. **Custom / Any OpenAI-Compatible API**
```yaml
provider: custom
endpoint: https://your-llm.internal:8080/v1
api_key: ${CUSTOM_API_KEY}
model: your-custom-model
headers:
  X-Custom-Header: value
  X-Tenant-ID: acme
baa_required: false  # Your responsibility
hipaa_compliant: true  # Your responsibility
```

**Models Available:** Whatever you host  
**Cost:** Your infrastructure  
**Setup Time:** Varies

---

## 🏗️ LLM Provider Registry Architecture

### Configuration Schema

```typescript
interface LLMProviderConfig {
  id: string;                    // 'azure-prod-1'
  name: string;                  // 'Azure AI Foundry - Production'
  tenantId: string;              // 'acme-insurance'
  
  // Provider Details
  provider: 'azure-ai-foundry' | 'aws-bedrock' | 'vertex-ai' | 
            'openai' | 'anthropic' | 'ollama' | 'vllm' | 
            'tgi' | 'llamacpp' | 'lmstudio' | 'localai' | 'custom';
  endpoint: string;              // API endpoint
  model: string;                 // Model name/ID
  
  // Authentication
  apiKey?: string;
  credentials?: {
    azureKeyCredential?: string;
    awsAccessKey?: string;
    awsSecretKey?: string;
    googleServiceAccount?: string;
  };
  headers?: Record<string, string>;
  
  // Compliance
  baaRequired: boolean;          // Does this need BAA?
  baaSigned: boolean;            // Do we have signed BAA?
  hipaaCompliant: boolean;       // Is it HIPAA compliant?
  dataResidency: string;         // 'us-east-1', 'local', etc.
  
  // Routing Rules
  allowedDataClassifications: DataClassification[];
  priority: number;              // 1-10 (higher = preferred)
  fallbackTo?: string;           // Fallback provider ID
  
  // Capabilities
  capabilities: {
    chat: boolean;
    streaming: boolean;
    functionCalling: boolean;
    embedding: boolean;
    vision: boolean;
    jsonMode: boolean;
  };
  
  // Limits & Quotas
  limits: {
    maxTokens: number;
    maxConcurrent: number;
    rateLimit: {
      requestsPerMinute: number;
      tokensPerMinute: number;
    };
  };
  
  // Cost Tracking
  pricing: {
    inputTokens: number;         // $ per 1K tokens
    outputTokens: number;
    currency: 'USD';
  };
  
  // Health
  healthCheck: {
    status: 'healthy' | 'degraded' | 'down';
    lastCheck: string;
    latencyMs: number;
    errorRate: number;
    uptime: number;              // %
  };
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

---

## 🎯 Routing Strategy

### Priority-Based Routing

```typescript
// Example: ACME Insurance configuration
const providerPriority = [
  {
    // Priority 1: Azure AI Foundry (BAA signed, lowest cost)
    id: 'azure-prod',
    provider: 'azure-ai-foundry',
    model: 'gpt-4-turbo',
    allowedData: ['PHI', 'PII', 'PUBLIC'],
    priority: 10,
    cost: 0.01,  // per 1K tokens
  },
  {
    // Priority 2: AWS Bedrock Claude (BAA signed, fallback)
    id: 'bedrock-prod',
    provider: 'aws-bedrock',
    model: 'claude-3-sonnet',
    allowedData: ['PHI', 'PII', 'PUBLIC'],
    priority: 9,
    cost: 0.003,
    fallbackTo: 'ollama-local',
  },
  {
    // Priority 3: Ollama (self-hosted, no BAA needed)
    id: 'ollama-local',
    provider: 'ollama',
    model: 'llama3:70b',
    allowedData: ['PHI', 'PII', 'PUBLIC'],
    priority: 8,
    cost: 0,  // Fixed infrastructure cost
  },
];
```

### Data Classification Routing

```typescript
// Routing logic
function routeLLM(dataClassification: DataClassification): LLMProvider {
  // Get all providers that allow this data type
  const allowedProviders = providerPriority.filter(p => 
    p.allowedData.includes(dataClassification)
  );
  
  // Sort by priority
  allowedProviders.sort((a, b) => b.priority - a.priority);
  
  // Check health and pick first healthy
  for (const provider of allowedProviders) {
    if (provider.healthCheck.status === 'healthy') {
      return provider;
    }
  }
  
  // All down? Use fallback
  return fallbackProvider;
}
```

---

## 🎨 Studio UI - Multi-Provider Configuration

```
┌──────────────────────────────────────────────────────────────┐
│  LLM Providers - ACME Insurance                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [+ Add Provider]                                            │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 1. Azure AI Foundry - Production        ✅ Healthy │    │
│  │    gpt-4-turbo • us-east-1 • 120ms                 │    │
│  │    PHI ✓  PII ✓  PUBLIC ✓  |  Priority: 10        │    │
│  │    Cost: $0.01/1K tokens  |  BAA: ✅ Signed       │    │
│  │    [Edit] [Test] [Disable]                         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 2. AWS Bedrock - Claude 3          ✅ Healthy      │    │
│  │    claude-3-sonnet • us-east-1 • 95ms              │    │
│  │    PHI ✓  PII ✓  PUBLIC ✓  |  Priority: 9         │    │
│  │    Cost: $0.003/1K tokens  |  BAA: ✅ Signed      │    │
│  │    Fallback: Ollama Local                          │    │
│  │    [Edit] [Test] [Disable]                         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 3. Ollama - Self-Hosted            ✅ Healthy      │    │
│  │    llama3:70b • Local VPC • 150ms                  │    │
│  │    PHI ✓  PII ✓  PUBLIC ✓  |  Priority: 8         │    │
│  │    Cost: Infrastructure only  |  BAA: Not needed   │    │
│  │    [Edit] [Test] [Disable]                         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Routing Logic: Priority → Health → Cost                    │
│                                                              │
│  [Test All Providers]  [Export Config]  [Import Config]    │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔧 Add Provider Wizard

```
┌──────────────────────────────────────────────────────────────┐
│  Add LLM Provider                                    [Step 1/4]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Choose Provider Type:                                       │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ ☁️ Azure AI     │  │ ☁️ AWS Bedrock  │                  │
│  │   Foundry       │  │                 │                  │
│  │   BAA Available │  │   BAA Available │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ ☁️ Google       │  │ 🔓 OpenAI       │                  │
│  │   Vertex AI     │  │   (with BAA)    │                  │
│  │   BAA Available │  │   Enterprise    │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ 🏠 Ollama       │  │ 🏠 vLLM         │                  │
│  │   Self-Hosted   │  │   Self-Hosted   │                  │
│  │   No BAA Needed │  │   No BAA Needed │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ 🔧 Custom API   │  │ 📚 More...      │                  │
│  │   Any OpenAI    │  │   TGI, llama.cpp│                  │
│  │   Compatible    │  │   LocalAI, etc. │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                              │
│              [Cancel]              [Next →]                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 📊 Cost Comparison Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  LLM Cost Analysis - Last 30 Days                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Total Cost: $4,250                                          │
│  Total Tokens: 425M                                          │
│  Avg Cost/1K: $0.01                                          │
│                                                              │
│  By Provider:                                                │
│  ████████████████░░░░ Azure AI     $3,200 (75%)             │
│  ████░░░░░░░░░░░░░░░ Bedrock       $800 (19%)               │
│  ██░░░░░░░░░░░░░░░░░ Ollama        $250 (6% - infra)        │
│                                                              │
│  By Data Classification:                                     │
│  ██████████░░░░░░░░░ PHI           $2,550 (60%)             │
│  ████░░░░░░░░░░░░░░░ PII           $1,275 (30%)             │
│  ███░░░░░░░░░░░░░░░░ PUBLIC        $425 (10%)               │
│                                                              │
│  Recommendations:                                            │
│  • Move 20% PHI → Ollama: Save $510/mo                      │
│  • Use Bedrock for PUBLIC: Save $85/mo                      │
│  • Total Potential Savings: $595/mo (14%)                   │
│                                                              │
│  [Export Report]  [Optimize Routing]  [View Details]        │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Setup Examples

### Azure AI Foundry
```bash
# 1. Get credentials from Azure Portal
AZURE_OPENAI_KEY="your-key"
AZURE_ENDPOINT="https://your-resource.openai.azure.com"

# 2. Configure in Studio
Provider: Azure AI Foundry
Endpoint: ${AZURE_ENDPOINT}
API Key: ${AZURE_OPENAI_KEY}
Deployment: gpt-4-turbo
BAA Signed: Yes

# 3. Test
curl ${AZURE_ENDPOINT}/openai/deployments/gpt-4-turbo/chat/completions \
  -H "api-key: ${AZURE_OPENAI_KEY}" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
```

### AWS Bedrock
```bash
# 1. Configure AWS credentials
aws configure

# 2. Enable Bedrock models in AWS Console

# 3. Configure in Studio
Provider: AWS Bedrock
Region: us-east-1
Model ID: anthropic.claude-3-sonnet-20240229-v1:0
BAA Signed: Yes

# 4. Test
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-sonnet-20240229-v1:0 \
  --body '{"messages":[{"role":"user","content":"test"}]}' \
  output.json
```

### Ollama (Self-Hosted)
```bash
# 1. Install
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull model
ollama pull llama3:70b-instruct

# 3. Configure in Studio
Provider: Ollama
Endpoint: http://localhost:11434
Model: llama3:70b-instruct
BAA Required: No

# 4. Test
curl http://localhost:11434/api/generate \
  -d '{"model":"llama3:70b-instruct","prompt":"test"}'
```

---

## ✅ Final Checklist

### For Each Provider
- [ ] Credentials configured
- [ ] Endpoint tested
- [ ] Model available
- [ ] BAA signed (if cloud)
- [ ] Data classification rules set
- [ ] Priority configured
- [ ] Fallback defined
- [ ] Cost tracking enabled
- [ ] Health checks working

### HIPAA Compliance
- [ ] PHI routes to compliant providers only
- [ ] All cloud providers have BAAs
- [ ] Audit logs enabled
- [ ] Encryption in transit (TLS)
- [ ] Access controls (IAM)
- [ ] Evidence pack ready

---

## 📚 Provider Comparison

| Provider | Setup | Cost | BAA | Best For |
|----------|-------|------|-----|----------|
| **Azure AI Foundry** | ⭐⭐ | 💰💰 | ✅ | Enterprise with MS stack |
| **AWS Bedrock** | ⭐⭐ | 💰 | ✅ | Enterprise with AWS |
| **Vertex AI** | ⭐⭐ | 💰 | ✅ | Enterprise with GCP |
| **OpenAI** | ⭐ | 💰💰💰 | ✅ | Highest quality |
| **Anthropic** | ⭐ | 💰💰 | ✅ | Long context |
| **Ollama** | ⭐ | $ | ❌ | Self-hosted, no BAA needed |
| **vLLM** | ⭐⭐⭐ | $$ | ❌ | High performance |

---

**Status:** Architecture complete  
**Implementation:** Next phase  
**Client Freedom:** 100% - ANY LLM they want 🚀



