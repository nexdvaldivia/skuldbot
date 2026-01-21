SkuldBot - Plataforma de Automatización Cognitiva (CLAUDE.md)

EMPRESA
Skuld, LLC - Una empresa de Asgard Insight.
Copyright y footer siempre debe decir: © [año] Skuld, LLC

PRINCIPIOS DE SEGURIDAD (OBLIGATORIO)

Claude DEBE seguir los más estrictos principios de seguridad al trabajar en este proyecto:

1. **Respetar decisiones de seguridad existentes**
   - Si hay un comentario como "// SECURITY:" o "// REMOVED for security", NO revertir esa decisión
   - SIEMPRE preguntar antes de modificar código relacionado con seguridad
   - No agregar funcionalidades que expongan datos sensibles sin autorización explícita

2. **Secrets y Credenciales**
   - Los valores de secretos NUNCA deben retornarse al frontend
   - Los secretos se resuelven en runtime por el BotRunner, no en el Studio
   - El Vault local usa encriptación AES-256-GCM y PBKDF2
   - Las API keys y passwords nunca se loguean ni se exponen en reportes

3. **Compliance-First**
   - Toda funcionalidad debe considerar HIPAA, SOC2, GDPR desde el diseño
   - PII/PHI debe detectarse y protegerse automáticamente
   - Audit logging es obligatorio para operaciones sensibles
   - Evidence Pack debe ser inmutable y verificable criptográficamente

4. **Antes de modificar código de seguridad**
   - Leer los comentarios existentes
   - Preguntar al usuario sobre la intención
   - No asumir que un error de compilación justifica cambiar la arquitectura de seguridad
   - Proponer alternativas que mantengan los principios de seguridad

5. **Defense in Depth**
   - Validación en frontend Y backend
   - Sanitización de inputs
   - Principio de menor privilegio
   - Separación de responsabilidades (Studio vs Runner vs Orchestrator)

QUÉ ES SKULDBOT

SkuldBot es una plataforma de automatización cognitiva y cumplimiento regulatorio que permite
diseñar, ejecutar y operar bots y agentes inteligentes en la infraestructura del cliente,
bajo un modelo SaaS híbrido y auditable.

SkuldBot combina:
- RPA visual (tipo n8n / Electroneek / UiPath)
- LLM Agents (razonamiento y toma de decisiones)
- Integración de datos (Singer taps & targets)
- Cumplimiento normativo (PII, PHI, HIPAA, SOC2, GDPR)
- Ejecución distribuida en BotRunners controlados por el cliente
- Orquestación centralizada y facturación por uso

EL MODELO COGNITIVO

SkuldBot NO es solo RPA.

Cada bot puede tener un Agente Cognitivo que:
- Interpreta lenguaje humano
- Decide qué acciones ejecutar
- Usa herramientas (los nodos de SkuldBot)
- Sigue políticas de compliance
- Genera evidencia auditable

IMPORTANTE: Los agentes NO son autónomos. Operan dentro del marco de SkuldBot.

EL MODELO DE NEGOCIO

SkuldBot es: Plataforma + Operación + Bots alquilables

Se cobra:
- Suscripción mensual del Orchestrator
- Licencia mensual por Runner
- Facturación por bot en uso
- Facturación por eventos procesados (ej: FNOL por llamada)

DIFERENCIADORES ESTRATÉGICOS

- Ejecución híbrida (SaaS + runner en cliente)
- Compliance-first by design
- Agentes LLM integrados al runtime
- Evidence Pack y auditoría automática
- Multi-OS: Windows, macOS y Linux (competidores son Windows-only)
- No requiere que el cliente desarrolle bots (tú los creas y alquilas)
- Ideal para healthcare, seguros, finanzas y logística
- Control total del cliente sobre infraestructura y datos

EVIDENCE PACK (ENTERPRISE-GRADE)

El Evidence Pack es un paquete de auditoría inmutable y criptográficamente verificable que se genera
automáticamente con cada ejecución de bot. Es el diferenciador clave para vender a industrias reguladas.

ARQUITECTURA DEL EVIDENCE PACK

1. Generación (Runner - Python)
   El EvidencePackWriter se ejecuta en el BotRunner durante la ejecución:
   - Intercepta eventos de cada nodo
   - Captura screenshots automáticos
   - Registra decisiones de agentes LLM
   - Rastrea data lineage en tiempo real
   - Firma criptográficamente cada entrada

2. Almacenamiento (Orchestrator - NestJS)
   - Storage: S3-compatible con encryption at rest (AES-256)
   - Metadata: PostgreSQL con índices para búsqueda
   - Retention: Configurable por tenant (7 años para finance, 6 años HIPAA)
   - Immutability: WORM (Write Once Read Many) - no se puede modificar ni borrar

3. Acceso (API + UI)
   - Signed URLs temporales para descarga
   - Viewer integrado en Orchestrator UI
   - Export a PDF para auditorías externas
   - API para integración con sistemas de compliance

ESTRUCTURA DEL EVIDENCE PACK

```
evidence-pack-{execution_id}.evp    # Archivo firmado (.evp = evidence pack)
├── manifest.json                    # Metadata + firma digital + chain of custody
├── execution/
│   ├── timeline.json                # Línea de tiempo completa con timestamps precisos
│   ├── node_results/
│   │   ├── node_001.json           # Input/output/duration/status de cada nodo
│   │   ├── node_002.json
│   │   └── ...
│   └── variables_snapshot.json      # Estado de variables en cada punto
├── screenshots/
│   ├── step_001_before.png         # Screenshot antes de acción
│   ├── step_001_after.png          # Screenshot después de acción
│   ├── step_001_highlight.png      # Screenshot con elemento destacado
│   └── ...
├── decisions/
│   ├── agent_decisions.json        # Todas las decisiones del agente LLM
│   │   - prompt enviado
│   │   - response recibida
│   │   - tokens usados
│   │   - reasoning chain
│   │   - confidence score
│   ├── conditional_branches.json   # Decisiones de branching
│   └── human_approvals.json        # Aprobaciones HITL si las hubo
├── data/
│   ├── lineage.json                # Data lineage completo
│   │   - source → transformations → destination
│   │   - clasificación en cada punto (PII/PHI/PCI)
│   │   - controles aplicados
│   ├── classifications.json        # Clasificaciones detectadas
│   ├── redactions.json             # Log de redacciones aplicadas
│   └── samples/                    # Muestras de datos (redactadas)
│       ├── input_sample.json
│       └── output_sample.json
├── compliance/
│   ├── policy_evaluation.json      # Resultado de evaluación de políticas
│   ├── controls_applied.json       # Controles que se aplicaron
│   ├── violations.json             # Violaciones detectadas (si las hubo)
│   └── certifications.json         # Certificaciones de compliance
├── errors/
│   ├── errors.json                 # Errores con stack traces
│   ├── retries.json                # Intentos de retry
│   └── recovery_actions.json       # Acciones de recuperación
├── artifacts/
│   ├── downloads/                  # Archivos descargados (hashes, no archivos)
│   ├── uploads/                    # Archivos subidos (hashes, no archivos)
│   └── generated/                  # Archivos generados
└── signatures/
    ├── manifest.sig                # Firma del manifest
    ├── chain.json                  # Chain of custody
    └── verification.json           # Info para verificar integridad
```

MANIFEST.JSON SCHEMA

```json
{
  "version": "1.0",
  "packId": "evp-uuid-v4",
  "executionId": "exec-uuid-v4",
  "botId": "bot-uuid-v4",
  "botVersion": "1.2.3",
  "tenantId": "tenant-uuid-v4",
  "runnerId": "runner-uuid-v4",

  "execution": {
    "startTime": "2025-01-18T10:00:00.000Z",
    "endTime": "2025-01-18T10:05:32.456Z",
    "durationMs": 332456,
    "status": "SUCCESS",
    "triggeredBy": "schedule",
    "triggerId": "trigger-uuid"
  },

  "environment": {
    "os": "linux",
    "osVersion": "Ubuntu 22.04",
    "pythonVersion": "3.11.5",
    "runtimeVersion": "1.0.0",
    "timezone": "UTC"
  },

  "statistics": {
    "nodesExecuted": 15,
    "nodesFailed": 0,
    "screenshotsCaptured": 23,
    "decisionsLogged": 3,
    "dataRecordsProcessed": 1547,
    "classificationsDetected": {
      "PII": 12,
      "PHI": 8,
      "PCI": 0
    },
    "controlsApplied": ["AUDIT_LOG", "LOG_REDACTION", "DLP_SCAN"]
  },

  "compliance": {
    "policyPackId": "hipaa-v1",
    "policyPackVersion": "1.0.0",
    "evaluationResult": "PASS",
    "violations": [],
    "warnings": []
  },

  "integrity": {
    "algorithm": "SHA-256",
    "contentHash": "sha256:abc123...",
    "signedAt": "2025-01-18T10:05:33.000Z",
    "signedBy": "runner-uuid-v4",
    "signature": "base64-signature..."
  },

  "chainOfCustody": [
    {
      "action": "CREATED",
      "timestamp": "2025-01-18T10:05:33.000Z",
      "actor": "runner-uuid-v4",
      "actorType": "RUNNER"
    },
    {
      "action": "UPLOADED",
      "timestamp": "2025-01-18T10:05:35.000Z",
      "actor": "orchestrator",
      "actorType": "SYSTEM"
    }
  ]
}
```

DATA LINEAGE SCHEMA

```json
{
  "version": "1.0",
  "executionId": "exec-uuid",
  "records": [
    {
      "id": "lineage-001",
      "timestamp": "2025-01-18T10:01:00.000Z",
      "sourceNode": "node_001",
      "sourceField": "output.data",
      "destinationNode": "node_003",
      "destinationField": "input.records",
      "transformation": "PASS_THROUGH",
      "classificationBefore": "PHI",
      "classificationAfter": "PHI",
      "controlsApplied": ["LOG_REDACTION"],
      "recordCount": 150
    }
  ],
  "summary": {
    "totalTransformations": 25,
    "dataFlowGraph": {
      "nodes": ["node_001", "node_002", "node_003"],
      "edges": [
        {"from": "node_001", "to": "node_002"},
        {"from": "node_002", "to": "node_003"}
      ]
    }
  }
}
```

AGENT DECISION SCHEMA

```json
{
  "version": "1.0",
  "executionId": "exec-uuid",
  "decisions": [
    {
      "id": "decision-001",
      "timestamp": "2025-01-18T10:02:15.000Z",
      "nodeId": "node_005",
      "nodeType": "ai.llm_prompt",
      "decisionType": "LLM_INFERENCE",

      "input": {
        "prompt": "[REDACTED - contains PHI]",
        "promptHash": "sha256:def456...",
        "model": "gpt-4",
        "temperature": 0.1,
        "maxTokens": 500
      },

      "output": {
        "response": "[REDACTED - contains PHI]",
        "responseHash": "sha256:ghi789...",
        "tokensUsed": {
          "prompt": 150,
          "completion": 85,
          "total": 235
        },
        "latencyMs": 1250
      },

      "reasoning": {
        "chain": [
          "Analyzed document type: Medical claim",
          "Identified required fields: patient_id, diagnosis_code, procedure_code",
          "Extracted values with confidence > 0.95",
          "Validated against expected format"
        ],
        "confidence": 0.97,
        "alternativesConsidered": 2
      },

      "compliance": {
        "promptGuardApplied": true,
        "piiDetectedInPrompt": true,
        "piiRedactedBeforeSend": true,
        "modelProvider": "azure-openai",
        "dataResidency": "us-east"
      }
    }
  ]
}
```

IMPLEMENTACIÓN

1. Engine (Python) - EvidencePackWriter
   Ubicación: engine/skuldbot/evidence/
   ```
   evidence/
   ├── __init__.py
   ├── writer.py              # EvidencePackWriter principal
   ├── collectors/
   │   ├── screenshot.py      # Captura de screenshots
   │   ├── decision.py        # Log de decisiones
   │   ├── lineage.py         # Data lineage tracker
   │   └── compliance.py      # Compliance collector
   ├── signing.py             # Firma criptográfica
   └── packaging.py           # Empaquetado final
   ```

2. Orchestrator (NestJS) - EvidencePackService
   Ubicación: orchestrator/api/src/evidence/
   ```
   evidence/
   ├── evidence.module.ts
   ├── evidence.service.ts    # Almacenamiento y retrieval
   ├── evidence.controller.ts # API endpoints
   ├── entities/
   │   └── evidence-pack.entity.ts
   ├── dto/
   │   ├── evidence-query.dto.ts
   │   └── evidence-export.dto.ts
   └── viewers/
       └── pdf-export.service.ts
   ```

3. Runner Integration
   El BotRunner instancia EvidencePackWriter al inicio de cada ejecución:
   - Pasa execution_id, bot_id, tenant_id
   - Writer intercepta eventos via callbacks
   - Al finalizar, empaqueta y sube a Orchestrator

VERIFICACIÓN DE INTEGRIDAD

Para auditorías, el Evidence Pack puede ser verificado:
1. Descargar .evp del storage
2. Verificar firma digital del manifest
3. Recalcular hashes de contenido
4. Comparar con hashes en manifest
5. Verificar chain of custody

Si cualquier archivo fue modificado, la verificación falla.

RETENCIÓN Y COMPLIANCE

Por industria:
- HIPAA: 6 años desde última fecha de servicio
- Finance (SOX): 7 años
- Insurance: 10 años (varía por estado)
- GDPR: Mientras sea necesario + política de retención

Configuración por tenant en TenantPolicyPack:
```json
{
  "retention": {
    "evidencePackDays": 2555,  // 7 años
    "auditLogDays": 2555,
    "deletePolicy": "ARCHIVE_THEN_DELETE"
  }
}
```

USO EN AUDITORÍAS

El Evidence Pack responde las preguntas clave de auditores:
- ¿Qué datos se procesaron? → data/lineage.json + classifications.json
- ¿Quién/qué tomó decisiones? → decisions/agent_decisions.json
- ¿Qué controles se aplicaron? → compliance/controls_applied.json
- ¿Hubo violaciones? → compliance/violations.json
- ¿Cuándo ocurrió todo? → execution/timeline.json
- ¿Se puede verificar? → signatures/ + integrity verification

TENANT POLICY PACKS (COMPLIANCE POR INDUSTRIA)

Los Tenant Policy Packs definen reglas de compliance específicas por industria.
Se evalúan en compile-time y runtime para garantizar cumplimiento.

Ubicación: packages/compiler/src/types/policy.ts (tipos)
           packages/compiler/src/policy/packs/ (implementaciones)

POLICY PACKS DISPONIBLES

1. HIPAA_POLICY_PACK (Healthcare)
   - Retención: 6 años (2190 días)
   - PHI a LLM externo: REQUIRE_CONTROLS [REDACT, PROMPT_GUARD, AUDIT_LOG]
   - PHI a email: REQUIRE_CONTROLS [DLP_SCAN, HITL_APPROVAL]
   - PHI egress: REQUIRE_CONTROLS [DLP_SCAN, LOG_REDACTION, AUDIT_LOG]
   - Encryption at rest: Obligatorio
   - Logging: Redactado automáticamente

2. SOC2_POLICY_PACK (SaaS/Technology)
   - Retención: 1 año (365 días)
   - PII egress externo: REQUIRE_CONTROLS [DLP_SCAN, AUDIT_LOG]
   - Credentials: REQUIRE_CONTROLS [VAULT_STORE, AUDIT_LOG]
   - Acceso privilegiado: REQUIRE_CONTROLS [HITL_APPROVAL, AUDIT_LOG]
   - Deletes: REQUIRE_CONTROLS [HITL_APPROVAL, AUDIT_LOG]
   - Change management: Todo cambio debe ser auditado

3. PCI_DSS_POLICY_PACK (Payments/Finance)
   - Retención: 1 año (365 días)
   - PCI data: BLOCK egress a EXTERNAL sin controles
   - PCI a logs: REQUIRE_CONTROLS [MASK, LOG_REDACTION]
   - PCI storage: REQUIRE_CONTROLS [ENCRYPT, TOKENIZE]
   - Credit cards: NEVER store full PAN
   - Network segmentation: Solo dominios permitidos

4. GDPR_POLICY_PACK (European Data)
   - Retención: Configurable por tenant (default 3 años)
   - PII processing: REQUIRE_CONTROLS [AUDIT_LOG, CONSENT_CHECK]
   - Data subject rights: Soporte para erasure requests
   - Cross-border: REQUIRE_CONTROLS [DLP_SCAN, DATA_RESIDENCY_CHECK]
   - Right to explanation: Decision logs obligatorios para AI
   - Data minimization: WARN si se procesan más datos de los necesarios

5. FINANCE_POLICY_PACK (Banking/Investment)
   - Retención: 7 años (2555 días) - SOX compliance
   - PCI + PII combined: Reglas más estrictas
   - AML/KYC data: REQUIRE_CONTROLS [AUDIT_LOG, IMMUTABLE_LOG]
   - Transaction data: REQUIRE_CONTROLS [AUDIT_LOG, NON_REPUDIATION]
   - Regulatory reporting: Evidence Pack obligatorio
   - Segregation of duties: HITL_APPROVAL para operaciones críticas

ESTRUCTURA DE UN POLICY PACK

```typescript
interface TenantPolicyPack {
  id: string;                    // 'hipaa-v1', 'soc2-v1', etc.
  version: string;               // Semantic versioning
  industry: string;              // healthcare, finance, etc.
  baseStandard: string;          // HIPAA, SOC2, PCI-DSS, GDPR

  defaults: {
    logging: {
      redact: boolean;           // Redactar PII/PHI en logs
      storeDays: number;         // Retención de logs
      immutable: boolean;        // WORM storage
    };
    artifacts: {
      encryptAtRest: boolean;    // AES-256
      encryptInTransit: boolean; // TLS 1.3
    };
    evidencePack: {
      required: boolean;         // Generar Evidence Pack
      retentionDays: number;     // Retención
      signatureRequired: boolean;// Firma digital
    };
  };

  rules: PolicyRule[];           // Reglas específicas

  dataClassifications: {
    [Classification]: {
      maxRetentionDays: number;
      allowedEgress: ('NONE' | 'INTERNAL' | 'EXTERNAL')[];
      requiredControls: ControlType[];
    };
  };

  approvals: {
    requiredFor: string[];       // Operaciones que requieren aprobación
    approverRoles: string[];     // Roles que pueden aprobar
    escalationAfterMinutes: number;
  };
}
```

EJEMPLO: CREACIÓN DE POLICY PACK CUSTOM

```typescript
const INSURANCE_CLAIMS_PACK: TenantPolicyPack = {
  id: 'insurance-claims-v1',
  version: '1.0.0',
  industry: 'insurance',
  baseStandard: 'SOC2',

  defaults: {
    logging: { redact: true, storeDays: 3650, immutable: true },
    artifacts: { encryptAtRest: true, encryptInTransit: true },
    evidencePack: { required: true, retentionDays: 3650, signatureRequired: true },
  },

  rules: [
    {
      id: 'INSURANCE_FNOL_AUDIT',
      description: 'All FNOL processing must be fully audited',
      when: { nodeCategory: 'fnol' },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG', 'SCREENSHOT', 'DECISION_LOG'],
        severity: 'HIGH',
      },
    },
    {
      id: 'INSURANCE_CLAIM_DECISION',
      description: 'Claim decisions require human approval above threshold',
      when: {
        nodeType: 'claims.adjudicate',
        // Custom condition: amount > $10,000
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['HITL_APPROVAL', 'AUDIT_LOG', 'EVIDENCE_PACK'],
        severity: 'CRITICAL',
      },
    },
    {
      id: 'INSURANCE_PHI_EXTERNAL',
      description: 'PHI in claims requires extra protection',
      when: {
        dataContains: ['PHI'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['DLP_SCAN', 'REDACT', 'AUDIT_LOG'],
        severity: 'CRITICAL',
      },
    },
  ],

  dataClassifications: {
    'PHI': {
      maxRetentionDays: 3650,
      allowedEgress: ['INTERNAL'],
      requiredControls: ['LOG_REDACTION', 'AUDIT_LOG'],
    },
    'PII': {
      maxRetentionDays: 3650,
      allowedEgress: ['INTERNAL', 'EXTERNAL'],
      requiredControls: ['AUDIT_LOG'],
    },
  },

  approvals: {
    requiredFor: ['claims.deny', 'claims.adjudicate_high_value'],
    approverRoles: ['claims_supervisor', 'compliance_officer'],
    escalationAfterMinutes: 60,
  },
};
```

EVALUACIÓN DE POLÍTICAS

El PolicyEvaluator (packages/compiler/src/policy/evaluate.ts) evalúa:

1. Compile-time:
   - Valida que el flujo cumpla con las políticas
   - Inyecta controles requeridos automáticamente
   - Genera warnings/blocks si hay violaciones

2. Runtime:
   - Verifica clasificaciones de datos en tiempo real
   - Aplica controles dinámicos
   - Genera eventos de auditoría

Resultado de evaluación:
```typescript
interface PolicyEvaluationResult {
  passed: boolean;
  blocks: PolicyViolation[];      // Violaciones que bloquean ejecución
  warnings: PolicyViolation[];    // Advertencias (no bloquean)
  injectedControls: {
    [nodeId: string]: ControlType[];
  };
  requiredApprovals: ApprovalRequest[];
}
```

SKULDBOT EN UNA LÍNEA

"SkuldBot es una plataforma cognitiva de automatización regulada, diseñada para que los bots
piensen, ejecuten y documenten sus acciones dentro de la infraestructura del cliente,
mientras tú cobras por el valor que generan."

ASISTENTE DE DESARROLLO
El asistente de IA para este proyecto se llama "Lico", en honor al abuelo del creador del proyecto.

FILOSOFÍA DEL PROYECTO
Este NO es un MVP. Estamos construyendo una plataforma de RPA COGNITIVO ENTERPRISE-GRADE diseñada
para competir y superar a los líderes del mercado como UiPath, Automation Anywhere y Blue Prism.

Principios fundamentales:
- CALIDAD SOBRE VELOCIDAD: Cada componente debe ser robusto, escalable y production-ready
- ARQUITECTURA IMPECABLE: Código limpio, patrones de diseño correctos, documentación completa
- SEGURIDAD FIRST: Encryption, audit trails, RBAC, compliance (SOC2, GDPR, HIPAA-ready)
- ESCALABILIDAD: Diseñado para miles de bots, millones de ejecuciones, multi-tenant desde el inicio
- UX SUPERIOR: La interfaz debe ser más intuitiva y poderosa que cualquier competidor
- AI-NATIVE con BYOM: Bring Your Own Model - cada cliente usa su propio LLM (OpenAI, Anthropic, Azure, Bedrock, on-premise)
- CLOUD-AGNOSTIC: CERO dependencia de un cloud específico. Debe correr en AWS, Azure, GCP, on-premise o hybrid
- OPEN CORE: Motor de ejecución propietario, valor en orquestación, governance y enterprise features

Arquitectura Cloud-Agnostic:
- Storage: Abstracción sobre S3/Azure Blob/GCS/MinIO/Local filesystem
- Database: PostgreSQL (funciona en cualquier cloud o on-premise)
- Queue: Redis/BullMQ (deployable anywhere) o abstracción sobre SQS/Azure Queue/etc
- Secrets: HashiCorp Vault / AWS Secrets Manager / Azure Key Vault / Local encrypted
- LLM: Interface abstracta, provider configurable por tenant (BYOM)
- Container Runtime: Kubernetes-native, funciona en EKS/AKS/GKE/OpenShift/bare-metal K8s

Filosofía BYO (Bring Your Own) - TODOS los servicios de terceros son configurables por tenant:
- BYO-LLM: OpenAI, Anthropic, Azure OpenAI, AWS Bedrock, Google Vertex, Ollama, LM Studio, custom endpoints
- BYO-Email: Twilio SendGrid, AWS SES, Azure Communication Services, Mailgun, SMTP propio
- BYO-SMS: Twilio, AWS SNS, Azure Communication Services, Vonage, MessageBird
- BYO-Storage: S3, Azure Blob, GCS, MinIO, local, SFTP
- BYO-OCR: AWS Textract, Azure Form Recognizer, Google Document AI, Tesseract, ABBYY
- BYO-Notifications: Slack, Teams, Discord, PagerDuty, OpsGenie, webhooks custom
- BYO-Identity: SAML 2.0, OIDC, LDAP/AD, Okta, Azure AD, Auth0, custom IdP

Cada tenant configura SUS propias credenciales y providers. SkuldBot NUNCA es intermediario de datos sensibles.

MERCADO OBJETIVO: INDUSTRIAS ALTAMENTE REGULADAS
Esta plataforma está diseñada específicamente para empresas en industrias con los más altos estándares de compliance:

Industrias target:
- Banca y Servicios Financieros (PCI-DSS, SOX, Basel III)
- Salud y Farmacéutica (HIPAA, FDA 21 CFR Part 11, GxP)
- Gobierno y Sector Público (FedRAMP, FISMA, StateRAMP)
- Seguros (SOC2, regulaciones estatales)
- Telecomunicaciones (CPNI, datos de clientes)
- Energía y Utilities (NERC CIP)

Compliance-by-Design:
- Audit trails inmutables (WORM - Write Once Read Many)
- Encryption at rest y in transit (AES-256, TLS 1.3)
- Data residency configurable por tenant (para GDPR, soberanía de datos)
- Role-Based Access Control granular con principio de mínimo privilegio
- Segregación de ambientes (dev/staging/prod) con controles estrictos
- Retención de logs configurable (7 años+ para regulaciones financieras)
- Trazabilidad completa: quién hizo qué, cuándo, desde dónde
- Capacidad de eDiscovery y legal hold
- Backup y disaster recovery con RTO/RPO configurables
- Penetration testing y vulnerability scanning integrado

NO negociables de seguridad:
- NUNCA almacenar passwords en texto plano (Argon2id obligatorio)
- NUNCA logs con datos sensibles (PII/PHI redactados automáticamente)
- NUNCA acceso a producción sin MFA
- NUNCA deploy sin code review y approval
- SIEMPRE principio de mínimo privilegio
- SIEMPRE encryption de datos sensibles
- SIEMPRE validación de inputs (prevención de injection)

Objetivo: UiPath debe parecer un juguete comparado con SkuldBot.

Mentalidad: "A partir de ahora jugamos en grande" - No hay atajos, no hay "después lo mejoramos".
Todo se hace bien desde el principio. Cada línea de código debe ser digna de una plataforma enterprise.

VISIÓN GENERAL
Esta plataforma define un sistema RPA cognitivo enterprise con un Studio visual,
un Orchestrator y un BotRunner desacoplados.

ARQUITECTURA
Studio (Tauri + React + React Flow)
→ DSL JSON
→ Compiler
→ Bot Package (.skb)
→ Orchestrator (NestJS)
→ BotRunner (Python)
→ Logs / Resultados

DECISIÓN TECNOLÓGICA CLAVE
- Studio NO debe usar Next.js.
  Motivo: Next.js está orientado a SSR/web y no aporta valor dentro de Tauri.
  El Studio debe usar:
    - React + Vite
    - React Flow
    - TailwindCSS
    - shadcn/ui

- Orchestrator:
    - NestJS (backend)
    - Next.js (frontend admin / dashboards)

GESTIÓN DE ERRORES (OBLIGATORIA)
Todos los nodos RPA deben tener salidas:
- success (línea verde)
- error (línea naranja)

El error es un objeto estructurado con:
code, message, nodeId, retryable, details

SISTEMA DE VARIABLES POR NODO

El sistema de variables permite que cada nodo tenga sus propias variables locales de estado,
además de variables globales para el último error.

1. Variables Por Nodo (Locales)
   Cada nodo tiene un diccionario de estado interno:
   NODE_<node_id> con keys: status, output, error

   En el Studio se accede usando el label del nodo:
   - ${Node Label.output}  → Salida principal del nodo
   - ${Node Label.error}   → Mensaje de error si el nodo falló
   - ${Node Label.status}  → Estado: pending, success, error

   El Compiler transforma automáticamente:
   ${Read Excel.output} → ${NODE_node_123}[output]

2. Variables Globales de Error
   Disponibles cuando un nodo está conectado via línea naranja (error):
   - ${LAST_ERROR}       → Mensaje del último error
   - ${LAST_ERROR_NODE}  → ID del nodo que falló
   - ${LAST_ERROR_TYPE}  → Tipo del nodo (ej: excel.read_range)

3. Variables de Sistema
   - ${BOT_ID}      → ID del bot
   - ${BOT_NAME}    → Nombre del bot
   - ${BOT_STATUS}  → Estado: RUNNING, SUCCESS, FAILED

4. Variables de Salida por Tipo de Nodo
   Excel:
   - ${EXCEL_DATA}       → Datos leídos (lista de diccionarios)
   - ${EXCEL_ROW_COUNT}  → Cantidad de filas
   - ${CELL_VALUE}       → Valor de celda individual

   Files:
   - ${FILE_CONTENT}  → Contenido del archivo leído
   - ${FILE_EXISTS}   → Boolean de existencia

   API/HTTP:
   - ${HTTP_RESPONSE}  → Cuerpo de respuesta
   - ${HTTP_STATUS}    → Código de estado HTTP

   Web:
   - ${LAST_TEXT}       → Texto extraído de elemento
   - ${LAST_ATTRIBUTE}  → Atributo extraído
   - ${JS_RESULT}       → Resultado de JavaScript

5. Transformación de Sintaxis (Compiler)
   El filtro transform_vars en compiler.py convierte la sintaxis del Studio
   a la sintaxis interna del runtime:

   Studio                          → Runtime
   ${Form Trigger.formData.name}   → formData["name"]
   ${Read Excel.output}            → NODE_node_id["output"]
   ${Read Excel.data}              → NODE_node_id["data"]
   ${LAST_ERROR}                   → LAST_ERROR (sin cambios)

   El Compiler mantiene un node_id_map (label → id) para la conversión.

6. Flujo de Datos Entre Nodos
   ```
   [Form Trigger] ──success──> [Read Excel] ──success──> [Log Data]
        │                           │                        │
        │ formData                  │ output, data           │ usa variables
        │ formData.name             │ status, error          │ de nodos anteriores
        │ formData.email            │ rowCount               │
        └───────────────────────────┴────────────────────────┘
                                    │
                                    ├──error──> [Handle Error]
                                                     │
                                                     │ LAST_ERROR
                                                     │ LAST_ERROR_NODE
                                                     │ LAST_ERROR_TYPE
                                                     │ Read Excel.error
   ```

7. Archivos Relacionados
   - engine/skuldbot/compiler/compiler.py
     - transform_variable_syntax() - Transforma sintaxis de variables
     - _node_id_map - Mapeo de labels a IDs

   - engine/skuldbot/compiler/templates/
     - Templates de generación de código
     - Define variables globales y per-nodo
     - Implementa TRY/EXCEPT con almacenamiento de errores

   - studio/src/components/NodeConfigPanel.tsx
     - Muestra variables disponibles en panel INPUT
     - Agrupa por nodo predecesor
     - Click para copiar expresión

SISTEMA DE DEBUG (MOTOR REAL)

El Studio está conectado al motor real de Python via Tauri IPC.
NO usa simulaciones - ejecuta código real.

1. Arquitectura de Ejecución
   ```
   Studio (React)
       │
       │ invoke("run_bot", { dsl: JSON.stringify(dsl) })
       ▼
   Tauri (Rust) ── main.rs: run_bot command
       │
       │ Python subprocess
       ▼
   Engine (Python)
       │
       ├── Compiler: DSL → Bot Package
       │
       └── Executor: SkuldBot Runtime
           │
           └── Output: logs, results
   ```

2. Flujo de Debug
   - Usuario presiona "Debug" (Play) en DebugPanel
   - debugStore.startDebug() genera DSL desde flowStore
   - Si no hay trigger, auto-agrega Manual Trigger
   - Llama invoke("run_bot") via Tauri IPC
   - El Engine compila DSL a directorio temporal
   - El Runtime ejecuta el bot compilado
   - Logs se parsean y muestran en tiempo real
   - Estados de nodos se actualizan (pending → running → success/error)

3. Comandos Tauri (main.rs)
   - run_bot: Compila y ejecuta DSL
   - compile_bot: Solo compila DSL a Bot Package
   - get_excel_sheets: Lee hojas de archivo Excel

4. Estados de Debug
   - idle: Sin ejecución
   - running: Ejecutando bot
   - paused: Pausado (breakpoints - futuro)
   - stopped: Ejecución terminada

5. Breakpoints (Futuro)
   - Se pueden agregar via click en nodo
   - Se almacenan en debugStore.breakpoints
   - Pendiente: integración con executor para pausar

6. Archivos Relacionados
   - studio/src/store/debugStore.ts
     - Estado de debug, breakpoints, historial
     - startDebug() ejecuta el bot real

   - studio/src/components/DebugPanel.tsx
     - UI de controles de debug
     - Play, Pause, Stop, Step

   - studio/src-tauri/src/main.rs
     - Comando run_bot que llama al Engine

   - engine/skuldbot/executor/executor.py
     - Ejecuta el runtime de SkuldBot
     - Parsea resultados para reportes

INTEGRACIÓN CON PYTHON (ELECTRONEEK-STYLE)
Nodo Python Project Executor:
- Ejecuta proyectos Python existentes
- Se define project path + entrypoint + entorno
- Retorna JSON estructurado
- Se enruta por success/error

BOT PACKAGE
Extensión de archivo: .skb (SkuldBot)

Los archivos de bot de SkuldBot usan la extensión .skb (similar a como n8n usa .json, UiPath usa .xaml).
Esta extensión es propietaria de SkuldBot y permite identificar fácilmente los archivos de bot.

El archivo .skb es internamente un archivo comprimido (.zip) que incluye:
- main.py (script principal)
- resources/ (keywords y handlers)
- variables/ (configuración)
- python/ (proyectos embebidos)
- requirements.txt / pyproject.toml
- manifest.json

OBJETIVO
Construir una plataforma de automatización cognitiva moderna, abierta y extensible donde
el valor esté en el Studio, la orquestación, el compliance y la integración con IA y datos.

RECOMENDACIÓN FINAL DE ARQUITECTURA

Se recomienda adoptar una arquitectura desacoplada y moderna que evite complejidad innecesaria y maximice mantenibilidad y escalabilidad.

Arquitectura recomendada:

apps/
- studio-desktop/
  - Tauri
  - React + Vite
  - React Flow
  - TailwindCSS
  - shadcn/ui

- orchestrator-api/
  - NestJS
  - PostgreSQL
  - Storage de artifacts

- orchestrator-ui/
  - Next.js
  - Dashboards
  - Gestión de bots, runs y usuarios

- bot-runner/
  - Python
  - SkuldBot Runtime + rpaframework

packages/
- dsl/
- compiler/
- node-sdk/

Esta separación garantiza:
- Studio ligero y optimizado para desktop
- Backend robusto y escalable
- Frontend web moderno para operación
- Runner determinista y seguro
- Evolución independiente de cada componente

RUNNER – FRAMEWORKS DE EJECUCIÓN

El BotRunner se basa en una combinación de componentes, donde cada uno cumple una función específica y complementaria.

SkuldBot Runtime:
- Actúa como el motor de ejecución propietario.
- Gestiona el control de flujo, la ejecución determinista, el manejo de errores y la generación de reportes.
- Optimizado para automatización cognitiva con soporte nativo para LLM agents.

RPA Framework (rpaframework):
- Proporciona librerías listas para producción para:
  - Automatización web
  - Automatización desktop
  - Manejo de Excel, archivos y PDFs
  - Email, APIs y servicios cloud
- Es open source (Apache 2.0).
- Constituye la capa RPA especializada del Runner.

Arquitectura final del Runner:
- Python
- SkuldBot Runtime (motor propietario)
- rpaframework (librerías RPA)
- Librerías Python personalizadas (nodos propios)
- Runtime Manager (gestión de entornos, dependencias y sandbox)

Esta combinación permite alcanzar paridad funcional con plataformas RPA comerciales, manteniendo apertura, extensibilidad
y control total del stack.

ESTRUCTURA DEL PROYECTO

La plataforma se organiza en un monorepo con 4 componentes principales:

📦 skuldbot/
├── engine/              ✅ LISTO - Motor de ejecución compartido
│   - Python + SkuldBot Runtime + rpaframework
│   - DSL, Compiler, Executor
│   - Usado por Studio (debug) y Runner (production)
│
├── studio/             🔜 TODO - Editor visual desktop
│   - Tauri + React + Vite + React Flow
│   - Editor drag & drop de flujos
│   - Preview y debug local
│   - Upload a Orchestrator
│
├── orchestrator/       🔜 TODO - Backend y UI web
│   ├── api/           - NestJS + PostgreSQL
│   │   - REST API para gestión
│   │   - Compilación de DSL
│   │   - Storage de artifacts
│   └── ui/            - Next.js
│       - Dashboards
│       - Gestión de bots y usuarios
│
└── runner/            🔜 TODO - Agente de ejecución
    - Python standalone
    - Polling/webhook de Orchestrator
    - Ejecuta Bot Packages
    - Envía logs en tiempo real

COMPONENTES COMPARTIDOS

El Engine actúa como librería compartida:
- Usado por Studio para compilar y ejecutar localmente
- Usado por Orchestrator para compilar DSL a Bot Packages
- Usado por Runner para ejecutar bots en producción

Opcionalmente se pueden publicar:
- @skuldbot/dsl (npm) – Definiciones TypeScript del DSL
- skuldbot-engine (PyPI) – Engine como paquete instalable

EJEMPLO DE DSL JSON

```json
{
  "version": "1.0",
  "bot": {
    "id": "bot-001",
    "name": "Extraer Facturas",
    "description": "Descarga facturas del portal y las procesa"
  },
  "nodes": [
    {
      "id": "node-1",
      "type": "browser.open",
      "config": {
        "url": "https://portal.example.com",
        "browser": "chromium"
      },
      "outputs": {
        "success": "node-2",
        "error": "node-error"
      }
    },
    {
      "id": "node-2",
      "type": "browser.fill",
      "config": {
        "selector": "#username",
        "value": "${credentials.username}"
      },
      "outputs": {
        "success": "node-3",
        "error": "node-error"
      }
    },
    {
      "id": "node-error",
      "type": "notification.send",
      "config": {
        "channel": "email",
        "message": "Error en bot: ${error.message}"
      }
    }
  ],
  "variables": {
    "credentials": {
      "type": "credential",
      "vault": "orchestrator"
    }
  }
}
```

DIAGRAMA DE ARQUITECTURA

```
┌─────────────────┐
│  Studio Desktop │
│  (Tauri + React)│
└────────┬────────┘
         │ Crea/Edita
         ▼
    ┌─────────┐
    │ DSL JSON│
    └────┬────┘
         │ Upload
         ▼
┌──────────────────────┐      ┌─────────────────┐
│   Orchestrator API   │◄────►│ Orchestrator UI │
│      (NestJS)        │      │    (Next.js)    │
└──────────┬───────────┘      └─────────────────┘
           │
           │ Dispatch Job
           ▼
    ┌─────────────┐
    │  Bot Runner │
    │  (Python +  │
    │   Robot FW) │
    └─────────────┘
           │
           │ Logs/Results
           ▼
    ┌──────────────┐
    │  PostgreSQL  │
    └──────────────┘
```

FLUJO DE EJECUCIÓN

1. Usuario diseña bot en Studio → genera bot.json
2. Usuario sube bot.json a Orchestrator vía UI
3. Orchestrator compila DSL → Bot Package (.skb)
4. Orchestrator almacena Bot Package
5. Usuario programa ejecución (trigger manual, schedule, webhook)
6. Orchestrator envía job a BotRunner disponible
7. BotRunner descarga Bot Package
8. BotRunner ejecuta con SkuldBot Runtime
9. BotRunner envía logs en tiempo real
10. BotRunner reporta resultado final (success/error)

SEGURIDAD Y AUTENTICACIÓN

Orchestrator API:
- JWT tokens con refresh
- RBAC (roles: admin, operator, viewer)
- API Keys para Runners

BotRunner:
- Autenticación con API Key rotativa
- Ejecución en sandbox (Docker/VM opcional)
- Secrets manejados por Orchestrator (no en Bot Package)

Studio:
- Autenticación opcional con Orchestrator
- Modo offline (edición local sin Orchestrator)
- Encriptación de credenciales en DSL

Variables sensibles:
- Nunca en DSL plano
- Referencias a vault: ${vault.api_key}
- Orchestrator resuelve en runtime

ROADMAP DE IMPLEMENTACIÓN

Fase 1 - Foundation (Enterprise-Grade):
- [ ] Studio básico (nodos web, archivos, variables)
- [ ] Compiler DSL → Bot Package (.skb)
- [ ] Orchestrator API (bots, jobs, users)
- [ ] Orchestrator UI (dashboard básico)
- [ ] BotRunner con polling simple
- [ ] Gestión de errores básica

Fase 2 - Producción (2-3 meses):
- [ ] Studio: más nodos (email, Excel, PDF, APIs)
- [ ] Studio: debugger visual
- [ ] Orchestrator: scheduling avanzado
- [ ] Orchestrator: webhooks
- [ ] BotRunner: ejecución paralela
- [ ] Logs en tiempo real (WebSockets)
- [ ] RBAC completo

Fase 3 - Enterprise (3-4 meses):
- [ ] Python Project Executor
- [ ] Integración con IA (OpenAI, Claude)
- [ ] Métricas y analytics avanzados
- [ ] Marketplace de nodos custom
- [ ] High availability (multi-runner)
- [ ] Auditoria completa

Fase 4 - Escalabilidad (ongoing):
- [ ] Kubernetes deployment
- [ ] Multi-tenancy
- [ ] Runner en edge
- [ ] Versionado de bots
- [ ] A/B testing de flujos

VERSIONADO DEL DOCUMENTO

- Versión: 1.0
- Fecha: Diciembre 2025
- Autor: Equipo Khipus
- Última actualización: 16/12/2025

NOTAS TÉCNICAS ADICIONALES

Compiler:
- Input: DSL JSON
- Output: Bot Package (.skb) con scripts ejecutables + resources/ + variables/ + manifest.json
- Validación de schema con JSON Schema
- Optimización de flujo (dead code elimination)

Bot Package (.skb):
```
bot-001.skb
├── manifest.json           # Metadata del bot
├── main.py                 # Script principal de ejecución
├── resources/
│   ├── keywords.py         # Keywords personalizados
│   └── error_handler.py    # Manejo de errores
├── variables/
│   └── config.yaml         # Configuración
├── python/
│   └── custom_library.py   # Librerías custom
└── requirements.txt        # Dependencias
```

Nota: El archivo .skb es internamente un archivo ZIP con extensión propietaria.

Orchestrator Storage:
- Artifacts: S3-compatible (MinIO, AWS S3)
- Logs: Time-series DB (opcional: InfluxDB)
- Metadata: PostgreSQL

Runner Environment:
- Python 3.10+
- Chromium/Firefox drivers automáticos
- Java 11+ (para ciertos nodos)
- Espacio temporal para downloads/uploads

