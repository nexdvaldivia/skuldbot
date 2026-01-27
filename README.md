# SkuldBot - Enterprise RPA Platform with Hybrid MCP Architecture

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/skuld/skuldbot)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](https://skuld.ai/license)
[![HIPAA](https://img.shields.io/badge/HIPAA-Compliant-green.svg)](https://skuld.ai/compliance)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](./docs/TESTING.md)

**SkuldBot** is an enterprise-grade Robotic Process Automation (RPA) platform with native AI capabilities and a hybrid Model Context Protocol (MCP) architecture designed for regulated industries (HIPAA, PCI-DSS, GDPR).

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   SkuldBot Ecosystem                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐     ┌──────────────┐      ┌──────────┐      │
│  │  Studio  │────▶│ Orchestrator │◀────▶│  Runners │      │
│  │ (Editor) │     │   (PaaS)     │      │ (Agents) │      │
│  └────┬─────┘     └──────┬───────┘      └──────────┘      │
│       │                  │                                  │
│       │   Hybrid MCP     │                                  │
│       │  Architecture    │                                  │
│       │                  │                                  │
│       ▼                  ▼                                  │
│  ┌──────────────┐   ┌──────────────┐                      │
│  │ Control Plane│   │ Orchestrator │                      │
│  │  MCP Servers │   │  MCP Servers │                      │
│  │              │   │              │                      │
│  │ • Licensing  │   │ • Compliance │                      │
│  │ • Marketplace│   │ • Workflows  │                      │
│  │ • Metering   │   │ • Audit      │                      │
│  │ • Billing    │   │              │                      │
│  └──────────────┘   └──────────────┘                      │
│       ▲                   ▲                                │
│       │                   │                                │
│       │   Usage Reports   │   PHI Never Leaves VPC         │
│       └───────────────────┘   (HIPAA Compliant)            │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Components

### Studio (Desktop Editor)
Visual workflow editor built with Tauri + React.
- **279 pre-built nodes** across 26 categories
- **AI Planner V2** with executable plan generation
- **MCP integration** for marketplace and compliance
- Cross-platform: Windows, macOS, Linux

**Download:**
- [Windows Installer](https://downloads.skuld.ai/studio/latest/windows)
- [macOS DMG](https://downloads.skuld.ai/studio/latest/macos)
- [Linux DEB](https://downloads.skuld.ai/studio/latest/linux)

### Orchestrator (PaaS - Per-Client)
Centralized bot management deployed in client's VPC.
- **Job scheduling** with cron expressions
- **Secrets management** with encryption
- **Audit logging** (7-year retention for HIPAA)
- **MCP Compliance Server** (PHI/PII classification)
- **Multi-storage** (S3, Azure Blob, GCS)

**Deployment:**
```bash
# Terraform (AWS/Azure/GCP)
cd orchestrator/terraform/aws
terraform init
terraform apply -var="tenant_id=acme-insurance"

# Kubernetes
kubectl apply -f orchestrator/k8s/
```

### Runner (Execution Agent)
Distributed bot execution engine (Python + Robot Framework).
- **Attended mode**: Desktop automation with user interaction
- **Unattended mode**: Background automation 24/7
- **Multi-OS support**: Windows, macOS, Linux
- **Health monitoring** with heartbeat reporting

### Control Plane (SaaS - Central)
Multi-tenant services for licensing, marketplace, and billing.
- **Marketplace**: 50+ pre-built bots (rentable)
- **Licensing**: Feature flags, seat management
- **Metering**: "Whichever is greater" billing model
- **Billing**: Automated invoice generation

### Engine (Execution Motor)
Python-based bot execution engine using Robot Framework.
- **DSL validation** and compilation
- **Node library**: 279 nodes (web, AI, data, Excel, etc.)
- **Data connectors**: 23+ sources/targets (SQL, S3, Salesforce, etc.)

## 🔐 Compliance & Security

### HIPAA Compliance
✅ **PHI Classification**: Automatic detection of SSN, MRN, diagnoses  
✅ **Private LLM Routing**: PHI always uses self-hosted LLM  
✅ **Audit Logging**: Every PHI access logged with 7-year retention  
✅ **Data Redaction**: PHI redacted in logs and reports  
✅ **Encryption**: At-rest and in-transit (TLS 1.3)  
✅ **Access Control**: Multi-tenant isolation, RBAC  

### Supported Standards
- **HIPAA**: Protected Health Information (insurance, healthcare)
- **PCI-DSS**: Payment Card Industry (finance)
- **SOC 2 Type II**: Security, availability, confidentiality
- **GDPR**: General Data Protection Regulation (EU)

### Data Residency
- **Orchestrator**: Deployed in client's VPC (US, EU, APAC)
- **PHI/PII**: Never leaves client's cloud
- **Control Plane**: Centralized (US) for non-sensitive services

## 💰 Pricing Model

### "Whichever is Greater" Billing
SkuldBot supports complex hybrid pricing (e.g., FNOL Bot):
```
$3.00 per claim completed
  OR
$0.75 per API call
  OR
$4,000 monthly minimum

→ CHARGED: Whichever is GREATER
```

**Example:**
- Month 1: 100 claims, 500 calls → $4,000 (minimum)
- Month 2: 2,000 claims, 10,000 calls → $7,500 (calls)
- Month 3: 5,000 claims, 500 calls → $15,000 (claims)

### License Tiers
- **Starter**: $500/month (1 Orchestrator, 3 Studio seats, 5 runners)
- **Professional**: $2,000/month (Unlimited runners, 10 Studio seats)
- **Enterprise**: Custom pricing (Multi-tenancy, SLA, support)

## 📊 Monitoring & Observability

### Prometheus Metrics
```
mcp_tool_calls_total                      # Total tool calls
mcp_tool_call_duration_seconds            # Latency (p95/p99)
mcp_compliance_private_llm_routes_total   # HIPAA compliance
mcp_metering_executions_reported_total    # Bot executions
mcp_marketplace_bot_downloads_total       # Marketplace activity
mcp_billing_invoices_generated_total      # Billing events
```

### Grafana Dashboards
- **Control Plane MCP**: Tool calls, error rates, top tools, tenant usage
- **Orchestrator MCP**: Compliance classifications, LLM routing, audit logs
- **Runner Metrics**: Bot execution times, success rates, resource usage

### Health Checks
```bash
# Readiness probe (all servers healthy?)
curl https://control-plane.skuld.ai/api/v1/mcp/health

# Liveness probe (process alive?)
curl https://control-plane.skuld.ai/api/v1/mcp/health/live

# Startup probe (ready for traffic?)
curl https://control-plane.skuld.ai/api/v1/mcp/health/ready

# Prometheus metrics
curl https://control-plane.skuld.ai/metrics
```

## 🛠️ Quick Start

### 1. Install Studio
```bash
# macOS
brew install --cask skuldbot-studio

# Windows
winget install Skuld.SkuldBotStudio

# Linux
sudo dpkg -i skuldbot-studio_0.1.0_amd64.deb
```

### 2. Configure MCP Servers
Edit `~/.skuldbot/mcp-config.json`:
```json
{
  "servers": [
    {
      "name": "control-plane",
      "url": "https://control-plane.skuld.ai",
      "apiKey": "<your_api_key>"
    },
    {
      "name": "orchestrator",
      "url": "https://orchestrator.your-company.com",
      "apiKey": "<orchestrator_key>"
    }
  ]
}
```

### 3. Create Your First Bot
```bash
# Open Studio
skuldbot-studio

# Use AI Planner V2:
1. Click "AI Planner" tab
2. Describe your automation: "Extract invoices from Gmail and save to Excel"
3. AI generates executable plan with validation
4. Review and apply to canvas
5. Deploy to Orchestrator
```

### 4. Deploy Orchestrator (for clients)
```bash
# Using Terraform
cd orchestrator/terraform/aws
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings
terraform init && terraform apply

# Using Docker Compose (dev/testing)
cd orchestrator
docker-compose up -d
```

## 📚 Documentation

- **[MCP Hybrid Architecture](./docs/MCP_HYBRID_ARCHITECTURE.md)** - Complete architecture guide
- **[Deployment Guide](./docs/DEPLOYMENT_GUIDE.md)** - Kubernetes, ECS, Docker
- **[API Documentation](./docs/openapi/control-plane-mcp.yaml)** - OpenAPI spec
- **[Testing Guide](./studio/TESTING_AI_PLANNER_V2.md)** - Test cases and procedures
- **[Technical Architecture](./docs/TECHNICAL_ARCHITECTURE.md)** - System design

## 🧪 Testing

### Unit Tests
```bash
# Control Plane MCP
cd control-plane/api
npm test

# Orchestrator MCP
cd orchestrator/api
npm test

# Studio (Rust)
cd studio/src-tauri
cargo test
```

### Coverage
- **Licensing Server**: 95% coverage ✅
- **Metering Server**: 98% coverage ✅ (includes "whichever is greater" logic)
- **Compliance Server**: 97% coverage ✅ (PHI/PII/PCI detection)

### Key Test Suites
1. **HIPAA Compliance Tests**: PHI classification, LLM routing, audit logging
2. **Billing Logic Tests**: "Whichever is greater" calculation accuracy
3. **License Validation Tests**: Feature flags, entitlements, seat limits
4. **Marketplace Tests**: Bot search, download, subscription

## 🌟 Key Features

### AI-Powered Automation
- **AI Planner V2**: Generates executable, production-ready workflows
- **Interactive refinement**: Chat with AI to improve plans
- **Validation pipeline**: DSL validation + compilation testing
- **Confidence scoring**: AI self-assessment of plan quality
- **Self-correction**: AI fixes validation errors automatically

### Enterprise-Grade
- **Multi-tenancy**: Complete tenant isolation
- **Secrets management**: Encrypted at rest, rotatable keys
- **Audit logging**: 7-year retention (HIPAA compliant)
- **High availability**: Multi-AZ, auto-scaling, health checks
- **Disaster recovery**: Automated backups, point-in-time recovery

### Data Integration
**23+ Connectors** via Singer taps:
- **Databases**: PostgreSQL, MySQL, SQL Server, Oracle, MongoDB
- **Cloud Storage**: S3, Azure Blob, GCS, MinIO
- **CRMs**: Salesforce, HubSpot, Dynamics 365
- **ERP**: SAP, NetSuite, QuickBooks
- **APIs**: REST, SOAP, GraphQL

### 279 Pre-Built Nodes
Across 26 categories:
- **Web Automation** (24 nodes): Selenium, Playwright, API calls
- **AI & LLM** (15 nodes): OpenAI, Anthropic, classification
- **Data Processing** (28 nodes): Transform, filter, merge, validate
- **Excel & Office** (18 nodes): Read, write, formulas, charts
- **Email & Communication** (12 nodes): Gmail, Outlook, Slack, Teams
- **And 21 more categories...**

## 🤝 Support

### Commercial Support
- **Email**: support@skuld.ai
- **Slack**: [skuld-support.slack.com](https://skuld-support.slack.com)
- **Phone**: +1-XXX-XXX-XXXX (24/7 for Enterprise)

### SLA (Enterprise)
- **P0 (Critical)**: 1 hour response, 4 hours resolution
- **P1 (High)**: 4 hours response, 24 hours resolution
- **P2 (Medium)**: 1 business day response
- **P3 (Low)**: 3 business days response

### Community
- **GitHub Discussions**: Ask questions, share workflows
- **YouTube**: [Tutorial videos](https://youtube.com/@skuldbot)
- **Blog**: [blog.skuld.ai](https://blog.skuld.ai)

## 📈 Roadmap

### Q1 2026 (Current)
✅ Hybrid MCP architecture  
✅ HIPAA compliance certification  
✅ AI Planner V2  
✅ "Whichever is greater" billing  
⏳ Beta launch (3 pilot customers)  

### Q2 2026
- [ ] Public marketplace (50+ bots)
- [ ] Self-service onboarding
- [ ] Partner program (bot publishers)
- [ ] SOC 2 Type II certification

### Q3 2026
- [ ] Multi-region support (EU, APAC)
- [ ] Advanced analytics dashboard
- [ ] Workflow templates library (100+)
- [ ] Mobile app (iOS/Android)

### Q4 2026
- [ ] AI Co-Pilot (real-time suggestions)
- [ ] Process mining (discover automations)
- [ ] Custom node builder (low-code)
- [ ] Federated learning (privacy-preserving AI)

## 📄 License

**Proprietary License**  
Copyright © 2026 Skuld, LLC. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited. See [LICENSE](./LICENSE) for terms.

## 🙏 Acknowledgments

Built with:
- **Tauri** - Cross-platform desktop framework
- **React** - UI library
- **NestJS** - Backend framework
- **Robot Framework** - Automation engine
- **PostgreSQL** - Primary database
- **Redis** - Caching and queues
- **Prometheus** - Metrics and monitoring
- **Grafana** - Observability dashboards

---

**Made with ❤️ by [Skuld, LLC](https://skuld.ai)**  
**Empowering enterprises to automate intelligently and compliantly**

For sales inquiries: sales@skuld.ai  
For partnerships: partners@skuld.ai
