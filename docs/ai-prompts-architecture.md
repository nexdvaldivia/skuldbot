# Skuldbot AI Prompts Architecture

## Executive Summary

This document describes the AI prompt management system for Skuldbot, designed for enterprise use in regulated industries. The system provides versioned, auditable prompts that comply with HIPAA, SOC2, PCI-DSS, and other regulatory requirements.

## Problem Statement

In enterprise AI applications, especially in regulated industries like Healthcare, Insurance, and Finance:

1. **Prompts must be auditable** - Regulators need to know what instructions the AI received
2. **Prompts must be versioned** - Changes must be tracked and rollback must be possible
3. **Users cannot control prompts** - Prevents prompt injection and ensures consistent behavior
4. **Data privacy is critical** - Data cannot leave approved infrastructure

## Solution Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SKULDBOT STUDIO                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  AI Repair Data Node Configuration                                   │   │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐ │   │
│  │  │ Context:         │ │ Min Confidence:  │ │ Allowed Actions:     │ │   │
│  │  │ ☑ Healthcare     │ │ [0.90]           │ │ ☑ Format Normalize   │ │   │
│  │  │ ☐ Insurance      │ │                  │ │ ☑ Semantic Cleanup   │ │   │
│  │  │ ☐ Finance        │ │                  │ │ ☐ Value Inference    │ │   │
│  │  │ ☐ General        │ │                  │ │ ☐ Sensitive Repair   │ │   │
│  │  └──────────────────┘ └──────────────────┘ └──────────────────────┘ │   │
│  │                                                                       │   │
│  │  NOTE: User configures WHAT, not HOW. No prompt field exposed.       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ DSL Node Config
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SKULDBOT ENGINE                                   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     PromptLoader (Internal)                           │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │  │
│  │  │ 1. Load System  │  │ 2. Load Context │  │ 3. Inject Config    │  │  │
│  │  │    Prompt       │  │    (Industry)   │  │    as Payload       │  │  │
│  │  │                 │  │                 │  │                     │  │  │
│  │  │ repair/         │  │ context_        │  │ min_confidence,     │  │  │
│  │  │ system_v1.md    │  │ healthcare.md   │  │ allowed_actions     │  │  │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │  │
│  │           │                    │                      │              │  │
│  │           └────────────────────┴──────────────────────┘              │  │
│  │                                │                                      │  │
│  │                    ┌───────────┴───────────┐                         │  │
│  │                    │ 4. Log Audit Event    │                         │  │
│  │                    │ - Timestamp           │                         │  │
│  │                    │ - Prompt Version      │                         │  │
│  │                    │ - Checksum            │                         │  │
│  │                    │ - Provider            │                         │  │
│  │                    │ - Execution ID        │                         │  │
│  │                    └───────────────────────┘                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                      │                                      │
│                          Assembled Prompt                                   │
│                                      ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      LLM Provider (Configurable)                      │  │
│  │                                                                        │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │  │
│  │  │ Azure OpenAI   │  │ Ollama         │  │ OpenAI/Anthropic       │  │  │
│  │  │ (RECOMMENDED)  │  │ (On-Premise)   │  │ (Non-Regulated Only)   │  │  │
│  │  │                │  │                │  │                        │  │  │
│  │  │ ✓ HIPAA BAA    │  │ ✓ Data stays   │  │ ⚠ Data leaves network │  │  │
│  │  │ ✓ SOC2         │  │   on-premise   │  │                        │  │  │
│  │  │ ✓ Data in your │  │ ✓ No external  │  │ Use only for:          │  │  │
│  │  │   Azure tenant │  │   API calls    │  │ - Test data            │  │  │
│  │  └────────────────┘  └────────────────┘  │ - Public data          │  │  │
│  │                                           └────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. PromptLoader (`skuldbot/ai/prompt_loader.py`)

The central component for prompt management.

**Key Responsibilities:**
- Load prompts from versioned files
- Parse frontmatter metadata
- Combine system prompt + context
- Generate audit logs
- Cache prompts for performance

**Key Methods:**
```python
# Load a system prompt
prompt, metadata = loader.load_prompt("repair", version="v1")

# Load industry context
context = loader.get_context_prompt("repair", "healthcare")

# Build complete prompt with audit
result = loader.build_full_prompt(
    node_type="repair",
    version="v1",
    context="healthcare",
    user_config={"min_confidence": 0.9},
    provider="azure_openai"
)
```

### 2. Prompt Files

Located in `engine/skuldbot/ai/prompts/`.

**File Format:**
```markdown
---
version: "1.0"
created: "2025-12-18"
author: "Skuldbot Team"
node: "ai.repair_data"
description: "System prompt for AI data repair"
audit_required: true
compliance_tags: ["HIPAA", "SOC2"]
---

[Prompt content in Markdown]
```

**Naming Conventions:**
- System prompts: `system_v1.md`, `system_v2.md`
- Context files: `context_healthcare.md`, `context_insurance.md`

### 3. SkuldAI Library (`skuldbot/libs/ai.py`)

The Robot Framework library that uses the prompt loader.

**Integration:**
```python
# In ai_repair_data method:
repair_prompt, prompt_audit = self._build_repair_prompt(
    data=data,
    problem_fields=problem_fields,
    context=context,  # "healthcare", "insurance", "finance"
    ...
    execution_id=execution_id,
)

# Result includes audit trail:
result = {
    ...
    "audit": {
        "execution_id": execution_id,
        "prompt_info": prompt_audit,
        "provider": "azure_openai",
    }
}
```

## Audit Trail

Every AI operation generates an audit entry:

```json
{
  "timestamp": "2025-12-18T10:30:00.000Z",
  "node_type": "ai.repair_data",
  "prompt_name": "system_v1",
  "prompt_version": "1.0",
  "prompt_checksum": "a1b2c3d4e5f6",
  "context": "healthcare",
  "provider": "azure_openai",
  "execution_id": "abc12345",
  "user_config_hash": "def67890",
  "metadata": {
    "author": "Skuldbot Team",
    "created": "2025-12-18",
    "audit_required": true,
    "compliance_tags": ["HIPAA", "SOC2"]
  }
}
```

**Note:** User config is hashed, not stored directly, to protect sensitive information while allowing verification.

## Industry Contexts

### Healthcare (HIPAA)

**Protected Health Information (PHI) Rules:**
- Never modify MRN, SSN, DOB
- Never infer medical diagnoses
- Format normalization only for dates
- Strict confidence thresholds (>= 0.95)

### Insurance

**Claim Data Rules:**
- Never modify claim amounts, policy numbers
- Status normalization to standards
- Date standardization to ISO 8601
- No inference of financial values

### Finance (SOX/PCI-DSS)

**Financial Data Rules:**
- Never modify account numbers, routing numbers
- Never process raw card data
- Transaction type/status normalization only
- Strictest confidence thresholds (>= 0.98)

## Security Considerations

### Prompt Injection Prevention

- Users cannot see or modify prompts
- Configuration is separate from instructions
- System prompt defines behavior, user config defines parameters

### Data Privacy

- Use Azure OpenAI or Ollama for regulated data
- Never send PHI/PCI data to public APIs
- Audit all data processing operations

### Access Control

- Prompt files should be read-only in production
- Changes require code review and deployment
- Git history provides complete change log

## Deployment Considerations

### Development

```python
# Use any provider
loader = PromptLoader()
prompt = loader.load_prompt("repair", "v1")
```

### Production (Regulated)

```python
# Force Azure OpenAI
from skuldbot.libs.ai import SkuldAI

ai = SkuldAI()
ai.configure_ai_provider(
    provider="azure_openai",
    api_key=vault.get("AZURE_OPENAI_KEY"),
    base_url="https://your-resource.openai.azure.com",
    model="gpt-4"
)
```

## Versioning Strategy

### When to Create New Version

1. **Major changes to behavior** → New major version (v2.md)
2. **Bug fixes or clarifications** → Patch update in same file
3. **New compliance requirements** → New version with tags

### Rollback Procedure

1. Change version reference in code
2. Deploy
3. Monitor for issues
4. Document reason for rollback

## Monitoring and Alerting

### Recommended Metrics

- Prompt version usage distribution
- Failure rate by prompt version
- Provider usage (ensure regulated data uses approved providers)
- Audit log volume

### Alert Conditions

- High failure rate for specific prompt version
- Regulated data sent to non-approved provider
- Missing audit logs

## Future Enhancements

1. **Prompt A/B Testing** - Compare versions in production
2. **Dynamic Context** - Load context based on data content
3. **Prompt Templates** - Variables in prompts for more flexibility
4. **Multi-Language Prompts** - Support for different languages
5. **Prompt Analytics** - Track effectiveness metrics
