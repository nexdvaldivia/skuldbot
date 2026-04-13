# SkuldBot MCP Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Control Plane Deployment](#control-plane-deployment)
3. [Orchestrator Deployment](#orchestrator-deployment)
4. [Studio Deployment](#studio-deployment)
5. [Monitoring Setup](#monitoring-setup)
6. [Security Configuration](#security-configuration)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Infrastructure Requirements

**Control Plane (SaaS - Skuld managed):**

- Kubernetes cluster (EKS/AKS/GKE) or AWS ECS
- PostgreSQL 14+ (RDS recommended)
- Redis 6+ (ElastiCache recommended)
- S3-compatible storage
- Domain with SSL certificate

**Orchestrator (PaaS - Per-client):**

- Kubernetes cluster OR VM (t3.large minimum)
- PostgreSQL 14+ (managed service recommended)
- Redis 6+
- VPC with private subnets
- Domain with SSL certificate

**Studio (Desktop - Client-side):**

- Windows 10+, macOS 11+, or Ubuntu 20.04+
- 4GB RAM minimum (8GB recommended)
- 500MB disk space

### Required Tools

```bash
# For Control Plane & Orchestrator
- kubectl (for Kubernetes deployment)
- docker
- helm 3+
- terraform (optional, for IaC)

# For Studio
- Node.js 18+
- Rust 1.70+
- Tauri CLI
```

---

## Control Plane Deployment

### Option 1: Kubernetes (Recommended for Production)

#### 1.1 Create Namespace and Secrets

```bash
kubectl create namespace skuldbot-control-plane

# Create PostgreSQL secret
kubectl create secret generic control-plane-db \
  --from-literal=host=control-plane-db.xxx.rds.amazonaws.com \
  --from-literal=port=5432 \
  --from-literal=username=skuld_cp \
  --from-literal=password=<YOUR_PASSWORD> \
  --from-literal=database=skuld_controlplane \
  -n skuldbot-control-plane

# Create Redis secret
kubectl create secret generic control-plane-redis \
  --from-literal=host=control-plane-redis.xxx.cache.amazonaws.com \
  --from-literal=port=6379 \
  --from-literal=password=<REDIS_PASSWORD> \
  -n skuldbot-control-plane
```

#### 1.2 Deploy PostgreSQL (if not using RDS)

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install control-plane-postgres bitnami/postgresql \
  --namespace skuldbot-control-plane \
  --set auth.username=skuld_cp \
  --set auth.password=<PASSWORD> \
  --set auth.database=skuld_controlplane \
  --set primary.persistence.size=50Gi
```

#### 1.3 Apply Kubernetes Manifests

```bash
cd control-plane/k8s

# Edit deployment.yaml to set correct image and env vars
kubectl apply -f deployment.yaml -n skuldbot-control-plane
kubectl apply -f service.yaml -n skuldbot-control-plane
kubectl apply -f ingress.yaml -n skuldbot-control-plane
kubectl apply -f hpa.yaml -n skuldbot-control-plane
```

#### 1.4 Verify Deployment

```bash
# Check pods
kubectl get pods -n skuldbot-control-plane

# Check health
kubectl port-forward svc/control-plane-api 3000:3000 -n skuldbot-control-plane
curl http://localhost:3000/api/v1/mcp/health

# Expected:
# {"status":"healthy","servers":{"licensing":"healthy",...}}
```

### Option 2: AWS ECS (Alternative)

#### 2.1 Create ECS Task Definition

```json
{
  "family": "control-plane-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "control-plane-api",
      "image": "skuld/control-plane-api:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" }
      ],
      "secrets": [
        { "name": "DB_HOST", "valueFrom": "arn:aws:secretsmanager:..." },
        { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:..." }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/api/v1/mcp/health/live || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/control-plane-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### 2.2 Create ECS Service

```bash
aws ecs create-service \
  --cluster skuldbot-production \
  --service-name control-plane-api \
  --task-definition control-plane-api:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=control-plane-api,containerPort=3000 \
  --health-check-grace-period-seconds 60
```

### Environment Variables (Control Plane)

```env
# Database
DB_HOST=control-plane-db.xxx.rds.amazonaws.com
DB_PORT=5432
DB_USERNAME=skuld_cp
DB_PASSWORD=<secret>
DB_DATABASE=skuld_controlplane

# Redis
REDIS_HOST=control-plane-redis.xxx.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=<secret>

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Optional: External integrations
STRIPE_API_KEY=sk_live_...
SENDGRID_API_KEY=SG...
```

---

## Orchestrator Deployment

### Prerequisites

- Client must provide: AWS account, VPC, RDS instance
- Skuld provides: Docker image, Terraform modules, deployment scripts

### Option 1: Terraform (Recommended)

#### 3.1 Initialize Terraform

```bash
cd orchestrator/terraform/aws

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars
nano terraform.tfvars
```

**terraform.tfvars:**

```hcl
tenant_id          = "acme-insurance"
region             = "us-east-1"
vpc_cidr           = "10.0.0.0/16"
db_instance_class  = "db.t3.medium"
ecs_task_cpu       = "1024"
ecs_task_memory    = "2048"
desired_count      = 2

control_plane_url  = "https://control-plane.skuld.ai"
control_plane_api_key = "<provided by Skuld>"

# HIPAA compliance settings
enable_encryption_at_rest = true
enable_audit_logging     = true
data_residency_region    = "us-east-1"

tags = {
  Customer    = "ACME Insurance"
  Environment = "production"
  Compliance  = "HIPAA"
}
```

#### 3.2 Deploy Infrastructure

```bash
terraform init
terraform plan
terraform apply

# This creates:
# - VPC with public/private subnets
# - ECS cluster
# - RDS PostgreSQL (encrypted)
# - Redis cluster
# - ALB with SSL
# - Security groups (restrictive)
# - CloudWatch log groups
# - Secrets Manager entries
```

#### 3.3 Verify Deployment

```bash
# Get ALB URL
ORCHESTRATOR_URL=$(terraform output -raw orchestrator_url)

# Check health
curl https://${ORCHESTRATOR_URL}/api/v1/mcp/health

# Expected:
# {"status":"healthy","servers":{"compliance":"healthy","workflow":"healthy"}}
```

### Option 2: Docker Compose (Development/Testing)

```bash
cd orchestrator

# Create .env file
cat > .env << EOF
TENANT_ID=test-tenant
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=skuld_orch
DB_PASSWORD=development_password
DB_DATABASE=skuld_orchestrator
REDIS_HOST=redis
REDIS_PORT=6379
CONTROL_PLANE_URL=http://host.docker.internal:3000
CONTROL_PLANE_API_KEY=dev-key
NODE_ENV=development
PORT=3000
EOF

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f orchestrator-api

# Check health
curl http://localhost:3000/api/v1/mcp/health
```

### Environment Variables (Orchestrator)

```env
# Tenant
TENANT_ID=acme-insurance

# Database
DB_HOST=orchestrator-db.xxx.rds.amazonaws.com
DB_PORT=5432
DB_USERNAME=skuld_orch
DB_PASSWORD=<secret>
DB_DATABASE=skuld_orchestrator

# Redis
REDIS_HOST=orchestrator-redis.xxx.cache.amazonaws.com
REDIS_PORT=6379

# Control Plane Integration
CONTROL_PLANE_URL=https://control-plane.skuld.ai
CONTROL_PLANE_API_KEY=<provided by Skuld>

# Compliance
DATA_RESIDENCY_REGION=us-east-1
ENABLE_PHI_CLASSIFICATION=true
ENABLE_AUDIT_LOGGING=true
MAX_DATA_RETENTION_DAYS=2555

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

---

## Studio Deployment

### Building Studio Installer

#### 4.1 Install Dependencies

```bash
cd studio
npm install
```

#### 4.2 Build for Target Platform

**Windows:**

```bash
npm run tauri build -- --target x86_64-pc-windows-msvc

# Output: src-tauri/target/release/bundle/msi/skuldbot-studio_0.1.0_x64_en-US.msi
```

**macOS:**

```bash
npm run tauri build -- --target x86_64-apple-darwin

# Output: src-tauri/target/release/bundle/dmg/SkuldBot Studio_0.1.0_x64.dmg
```

**Linux:**

```bash
npm run tauri build -- --target x86_64-unknown-linux-gnu

# Output: src-tauri/target/release/bundle/deb/skuldbot-studio_0.1.0_amd64.deb
```

#### 4.3 Code Signing (Production)

**Windows:**

```bash
signtool sign /f certificate.pfx /p <password> /tr http://timestamp.digicert.com /td sha256 /fd sha256 skuldbot-studio.msi
```

**macOS:**

```bash
codesign --deep --force --verify --verbose --sign "Developer ID Application: Skuld, LLC" --options runtime SkuldBot\ Studio.app
```

### Distribution

#### 4.4 Upload to Distribution Server

```bash
# Upload to S3
aws s3 cp skuldbot-studio_0.1.0_x64_en-US.msi \
  s3://skuld-downloads/studio/releases/v0.1.0/ \
  --acl public-read

# Generate download links
echo "Windows: https://downloads.skuld.ai/studio/releases/v0.1.0/skuldbot-studio_0.1.0_x64_en-US.msi"
echo "macOS: https://downloads.skuld.ai/studio/releases/v0.1.0/SkuldBot-Studio_0.1.0_x64.dmg"
echo "Linux: https://downloads.skuld.ai/studio/releases/v0.1.0/skuldbot-studio_0.1.0_amd64.deb"
```

### Client-Side Configuration

#### 4.5 Studio MCP Configuration

Users configure MCP servers in `~/.skuldbot/mcp-config.json`:

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

## Monitoring Setup

### Prometheus Configuration

#### 5.1 Create prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'control-plane-mcp'
    static_configs:
      - targets: ['control-plane-api:3000']
    metrics_path: '/metrics'

  - job_name: 'orchestrator-mcp'
    static_configs:
      - targets: ['orchestrator-api:3000']
    metrics_path: '/metrics'

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
```

#### 5.2 Deploy Prometheus to Kubernetes

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/prometheus \
  --namespace monitoring \
  --create-namespace \
  --set server.persistentVolume.size=50Gi
```

### Grafana Setup

#### 5.3 Deploy Grafana

```bash
helm install grafana grafana/grafana \
  --namespace monitoring \
  --set persistence.enabled=true \
  --set persistence.size=10Gi \
  --set adminPassword='<YOUR_PASSWORD>'

# Get admin password
kubectl get secret --namespace monitoring grafana -o jsonpath="{.data.admin-password}" | base64 --decode
```

#### 5.4 Import Dashboards

```bash
# Port-forward to Grafana
kubectl port-forward -n monitoring svc/grafana 3001:80

# Open browser: http://localhost:3001
# Login with admin/<password>

# Import dashboard:
# 1. Go to Dashboards > Import
# 2. Upload docs/grafana/skuldbot-mcp-control-plane.json
# 3. Select Prometheus datasource
# 4. Click Import
```

---

## Security Configuration

### SSL/TLS Certificates

#### 6.1 Using Let's Encrypt (Kubernetes)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.11.0/cert-manager.yaml

# Create ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@skuld.ai
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Update ingress to use TLS
kubectl annotate ingress control-plane-ingress \
  cert-manager.io/cluster-issuer=letsencrypt-prod \
  -n skuldbot-control-plane
```

### API Key Management

#### 6.2 Generate Tenant API Keys

```bash
# Generate secure API key
openssl rand -hex 32

# Store in database
psql -h control-plane-db.xxx.rds.amazonaws.com -U skuld_cp -d skuld_controlplane << EOF
INSERT INTO api_keys (tenant_id, key_hash, name, scopes, created_at)
VALUES (
  'acme-insurance',
  crypt('<generated_key>', gen_salt('bf')),
  'Production Key',
  ARRAY['mcp:read', 'mcp:write'],
  NOW()
);
EOF
```

### Network Security

#### 6.3 Security Group Rules (AWS)

```hcl
# Orchestrator Security Group
resource "aws_security_group" "orchestrator" {
  name        = "${var.tenant_id}-orchestrator-sg"
  description = "Security group for Orchestrator (HIPAA compliant)"
  vpc_id      = aws_vpc.main.id

  # Allow HTTPS from Studio (client IPs)
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_client_cidrs
    description = "HTTPS from authorized clients"
  }

  # Allow HTTP from ALB (for health checks)
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "HTTP from ALB"
  }

  # Deny all other ingress
  # (no egress rules = deny all by default)

  tags = {
    Name       = "${var.tenant_id}-orchestrator-sg"
    Compliance = "HIPAA"
  }
}
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Control Plane pods not starting

```bash
# Check pod logs
kubectl logs -n skuldbot-control-plane deployment/control-plane-api

# Common causes:
# - Database connection failure
# - Missing environment variables
# - Insufficient resources

# Check events
kubectl get events -n skuldbot-control-plane --sort-by='.lastTimestamp'
```

#### Issue 2: MCP health check failing

```bash
# Test health endpoint
curl -v https://control-plane.skuld.ai/api/v1/mcp/health

# Check individual servers
curl https://control-plane.skuld.ai/api/v1/mcp/tools

# Verify database connectivity
kubectl exec -it -n skuldbot-control-plane deployment/control-plane-api -- \
  psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE -c "SELECT 1;"
```

#### Issue 3: Studio cannot connect to MCP servers

```bash
# Check MCP config file
cat ~/.skuldbot/mcp-config.json

# Test connectivity
curl -H "x-api-key: <YOUR_KEY>" \
     -H "x-tenant-id: <YOUR_TENANT>" \
     https://control-plane.skuld.ai/api/v1/mcp/tools

# Check Studio logs (Windows)
%APPDATA%\com.skuld.studio\logs\main.log

# Check Studio logs (macOS)
~/Library/Logs/com.skuld.studio/main.log

# Check Studio logs (Linux)
~/.config/com.skuld.studio/logs/main.log
```

#### Issue 4: "Whichever is greater" billing incorrect

```bash
# Check metering data
curl -H "x-api-key: <KEY>" \
     -H "x-tenant-id: <TENANT>" \
     https://control-plane.skuld.ai/api/v1/mcp/resources/metering://tenant/<TENANT>/current-period

# Verify bot pricing model
curl -H "x-api-key: <KEY>" \
     https://control-plane.skuld.ai/api/v1/mcp/resources/marketplace://bots/<BOT_ID>

# Re-calculate invoice
curl -X POST -H "x-api-key: <KEY>" \
     -H "Content-Type: application/json" \
     https://control-plane.skuld.ai/api/v1/mcp/tools/call \
     -d '{"name":"calculate_invoice","arguments":{"tenantId":"<TENANT>","period":"2026-01"}}'
```

#### Issue 5: PHI/PII classification not working

```bash
# Test classification
curl -X POST -H "x-tenant-id: <TENANT>" \
     https://orchestrator.<tenant>.com/api/v1/mcp/tools/call \
     -d '{
       "name": "classify_data",
       "arguments": {
         "tenantId": "<TENANT>",
         "data": {"ssn": "123-45-6789"}
       }
     }'

# Check compliance logs
kubectl logs -n <tenant>-orchestrator deployment/orchestrator-api | grep "classify_data"

# Verify classification rules
curl https://orchestrator.<tenant>.com/api/v1/mcp/resources/compliance://tenant/<TENANT>/classification-rules
```

### Performance Optimization

#### Scaling Control Plane

```bash
# Horizontal scaling
kubectl scale deployment control-plane-api --replicas=5 -n skuldbot-control-plane

# Or use HPA (already configured)
kubectl get hpa -n skuldbot-control-plane
```

#### Database Performance

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Add indexes for MCP queries
CREATE INDEX idx_usage_tenant_bot_period ON usage_records(tenant_id, bot_id, period);
CREATE INDEX idx_licenses_tenant_feature ON licenses(tenant_id, feature);
```

---

## Support

**Technical Support:**

- Email: support@skuld.ai
- Slack: skuld-support.slack.com
- Documentation: https://docs.skuld.ai

**Emergency Contact:**

- 24/7 On-call: +1-XXX-XXX-XXXX
- PagerDuty: https://skuld.pagerduty.com

**SLA:**

- Critical (P0): 1 hour response
- High (P1): 4 hours response
- Medium (P2): 1 business day
- Low (P3): 3 business days

---

**Document Version:** 1.0  
**Last Updated:** January 27, 2026  
**Maintained By:** Skuld DevOps Team
