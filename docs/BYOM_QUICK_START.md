# BYOM Quick Start Guide - 5 Minutes Setup

## 🎯 Goal: Self-hosted LLM for HIPAA compliance in 5 minutes

---

## Option 1: Ollama (Easiest - Recommended for Most)

### Step 1: Install Ollama (1 minute)
```bash
# Linux/Mac
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from: https://ollama.com/download
```

### Step 2: Pull a Model (2 minutes)
```bash
# Small & Fast (8B parameters) - Good for most tasks
ollama pull llama3:8b-instruct

# OR Large & Powerful (70B parameters) - Best quality
ollama pull llama3:70b-instruct
```

### Step 3: Configure in SkuldBot Studio (1 minute)
```yaml
# In Studio → Settings → BYOM Configuration
Provider: Ollama
Endpoint: http://localhost:11434
Model: llama3:8b-instruct
HIPAA Compliant: Yes
Data Residency: Local
```

### Step 4: Test (30 seconds)
```bash
# Studio will auto-test the connection
# ✅ Status: Connected
# ✅ Latency: 120ms
# ✅ Model: llama3:8b-instruct
```

**Done! PHI now stays on your machine. ✅**

---

## Option 2: Docker Compose (Production Setup)

### Single Command Setup
```bash
# Clone config
git clone https://github.com/skuldbot/byom-configs
cd byom-configs/ollama

# Start (includes GPU support)
docker-compose up -d

# Verify
curl http://localhost:11434/api/tags
```

### `docker-compose.yml`
```yaml
version: '3.8'
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  ollama-data:
```

### Auto-pull Models
```bash
# Add to startup script
docker exec ollama ollama pull llama3:8b-instruct
```

---

## Option 3: Cloud Deployment (AWS/Azure/GCP)

### AWS (Terraform - 3 minutes)
```hcl
# main.tf
module "byom_ollama" {
  source = "skuldbot/byom-ollama/aws"
  
  instance_type = "g5.xlarge"  # ~$1.50/hr with GPU
  model_name    = "llama3:8b-instruct"
  vpc_id        = var.vpc_id
  subnet_id     = var.subnet_id
}

output "ollama_endpoint" {
  value = module.byom_ollama.endpoint
}
```

### Deploy
```bash
terraform init
terraform apply -auto-approve

# Get endpoint
terraform output ollama_endpoint
# Output: https://ollama.acme.internal:11434
```

### Configure in Studio
```yaml
Provider: Ollama
Endpoint: https://ollama.acme.internal:11434
Model: llama3:8b-instruct
HIPAA Compliant: Yes
Data Residency: us-east-1
```

---

## Studio Configuration UI (Mock)

```
┌────────────────────────────────────────────────┐
│  SkuldBot Studio - BYOM Configuration         │
├────────────────────────────────────────────────┤
│                                                │
│  Provider:  [Ollama ▼]                         │
│                                                │
│  Endpoint:  [http://localhost:11434______]    │
│                                                │
│  Model:     [llama3:8b-instruct________]       │
│                                                │
│  [Test Connection]  Status: ✅ Connected       │
│                     Latency: 120ms             │
│                                                │
│  ☑ Use for PHI/PII data (HIPAA)               │
│  ☑ Use for workflow generation                │
│  ☐ Use for public data (fallback)             │
│                                                │
│  Data Residency: [Local Machine]              │
│                                                │
│             [Save Configuration]               │
└────────────────────────────────────────────────┘
```

---

## Model Selection Guide

| Model | Size | Speed | Quality | Use Case | Cost/Month |
|-------|------|-------|---------|----------|------------|
| **llama3:8b** | 8B | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | Most tasks, dev | $300 |
| **llama3:70b** | 70B | ⚡ Slower | ⭐⭐⭐⭐⭐ Excellent | Production, complex | $3,000 |
| **mistral:7b** | 7B | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | Lightweight | $300 |
| **mixtral:8x7b** | 47B | ⚡⚡ Medium | ⭐⭐⭐⭐ Very Good | Balanced | $1,500 |
| **codellama:34b** | 34B | ⚡⚡ Medium | ⭐⭐⭐⭐ Code | Automation logic | $1,500 |

**Recommendation for HIPAA:**
- **Dev/Test:** llama3:8b ($300/mo)
- **Production:** llama3:70b ($3,000/mo)
- **Budget:** mixtral:8x7b ($1,500/mo)

---

## Common Configurations

### Small Practice (100-1K patients)
```yaml
# Local machine or single AWS instance
Provider: Ollama
Instance: AWS g5.xlarge ($1.50/hr = $1,100/mo)
Model: llama3:8b-instruct
Concurrent: 5-10 requests
Cost: ~$1,100/month
```

### Regional Hospital (10K-100K patients)
```yaml
# Load-balanced cluster
Provider: vLLM
Instances: 3x g5.12xlarge (auto-scale)
Model: llama3:70b-instruct
Concurrent: 50-100 requests
Cost: ~$9,000/month
```

### National Health System (1M+ patients)
```yaml
# Enterprise cluster with caching
Provider: vLLM
Instances: 10x g5.48xlarge + Redis
Model: llama3:70b + fine-tuned models
Concurrent: 500+ requests
Cost: ~$50,000/month (vs $300K with GPT-4)
```

---

## Troubleshooting

### Connection Failed
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
sudo systemctl restart ollama

# Check logs
journalctl -u ollama -f
```

### Slow Performance
```bash
# Check GPU usage
nvidia-smi

# Increase context window
ollama run llama3:8b-instruct --ctx-size 8192

# Use quantized model (faster, slightly lower quality)
ollama pull llama3:8b-instruct-q4_K_M
```

### Out of Memory
```bash
# Use smaller model
ollama pull llama3:8b-instruct  # instead of 70b

# OR add more GPU memory
# Upgrade to g5.2xlarge (24GB) or g5.12xlarge (96GB)
```

---

## Security Checklist for HIPAA

### Network
- [x] BYOM runs in private VPC (no public internet)
- [x] TLS/SSL for all connections
- [x] Firewall rules (only Studio can access)
- [x] VPC peering (if Studio in different VPC)

### Data
- [x] Encryption at rest (EBS volumes encrypted)
- [x] Encryption in transit (HTTPS)
- [x] No data logging (Ollama doesn't log prompts)
- [x] Ephemeral context (cleared after each request)

### Access
- [x] IAM roles (principle of least privilege)
- [x] API keys rotated every 90 days
- [x] Audit logs enabled
- [x] MFA for admin access

### Compliance
- [x] HIPAA Risk Assessment completed
- [x] Policies & Procedures documented
- [x] Staff training on PHI handling
- [x] Incident response plan
- [x] Evidence pack for audits

---

## Cost Calculator

### Input Your Numbers
```
Workflows per month:     [____] 
PHI data percentage:     [____]%
Avg tokens per workflow: [____]

Calculate →
```

### Example: Small Practice
```
Workflows:    1,000/month
PHI:          80%
Tokens:       1,500/workflow

BYOM Cost:    $1,100/month (Ollama on g5.xlarge)
vs Cloud:     $9,000/month (GPT-4 with BAA)
Savings:      $7,900/month (88% reduction)
ROI:          Immediate
```

---

## Next Steps

### 1. Install Ollama (5 min)
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3:8b-instruct
```

### 2. Configure Studio
- Open Studio → Settings → BYOM
- Add endpoint: `http://localhost:11434`
- Select model: `llama3:8b-instruct`
- Test connection

### 3. Enable HIPAA Mode
- Settings → Compliance → Enable HIPAA
- All PHI automatically routes to BYOM
- Audit logs enabled

### 4. Test with Sample Data
- Create test workflow with PHI
- Verify LLM routes to BYOM (check logs)
- Review audit trail

### 5. Production Deployment
- Deploy Ollama to AWS/Azure (Terraform)
- Update Studio endpoint
- Run compliance validation
- Go live!

---

## Support Resources

- **Ollama Docs:** https://github.com/ollama/ollama
- **SkuldBot BYOM Guide:** /docs/BYOM_ARCHITECTURE.md
- **Community Forum:** https://community.skuldbot.com
- **Enterprise Support:** support@skuldbot.com

---

**Time to Setup:** 5 minutes (local) to 30 minutes (cloud)  
**Difficulty:** ⭐ Easy (Ollama) to ⭐⭐⭐ Moderate (vLLM cluster)  
**Cost:** $0 (local dev) to $1,100/month (production)  
**HIPAA Ready:** ✅ Yes  
**BAA Required:** ❌ No  

---

*Updated: 2026-01-27*  
*Version: 1.0*


