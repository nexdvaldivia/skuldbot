# Skuldbot AI Prompts - Versioned Prompt Management System

## Overview

This directory contains versioned, auditable prompts for all AI-powered nodes in Skuldbot.
The system is designed for enterprise use in regulated industries (Healthcare, Insurance, Finance)
where prompt governance and auditability are critical requirements.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  UI (Node Configuration)                                        │
│  - User configures WHAT: context, confidence, allowed actions   │
│  - User does NOT control the prompt (internal artifact)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PromptLoader (skuldbot.ai.prompt_loader)                       │
│  1. Loads versioned system prompt (system_v1.md)                │
│  2. Loads industry context (context_healthcare.md)              │
│  3. Injects user configuration as payload                       │
│  4. Logs audit event for compliance                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM Provider (configured by admin)                             │
│  - Azure OpenAI (recommended for HIPAA/regulated)               │
│  - Ollama (on-premise, maximum privacy)                         │
│  - OpenAI / Anthropic (for non-sensitive data only)             │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Principles

1. **Prompts are Internal Artifacts**
   - Users cannot see or modify prompts
   - Users configure intent and constraints, product controls reasoning
   - This prevents prompt injection and ensures consistent behavior

2. **Version Control**
   - Each prompt is a versioned file (system_v1.md, system_v2.md)
   - Changes are tracked in git
   - Easy rollback to previous versions

3. **Audit Trail**
   - Every prompt load is logged with:
     - Timestamp (UTC)
     - Prompt version and checksum
     - User configuration hash
     - Provider used
     - Execution ID
   - Required for HIPAA, SOC2, PCI-DSS compliance

4. **Industry-Specific Context**
   - Healthcare: HIPAA compliance, PHI protection
   - Insurance: Claim data protection, regulatory compliance
   - Finance: SOX/PCI-DSS compliance, financial data protection

## Directory Structure

```
prompts/
├── README.md                 # This file
│
├── extract/                  # Extract Data From Text
│   └── system_v1.md
│
├── extract_table/            # Extract Table From Text
│   └── system_v1.md
│
├── summarize/                # Summarize Text
│   └── system_v1.md
│
├── classify/                 # Classify Text
│   └── system_v1.md
│
├── translate/                # Translate Text
│   └── system_v1.md
│
├── sentiment/                # Analyze Sentiment
│   └── system_v1.md
│
├── analyze_image/            # Analyze Image
│   └── system_v1.md
│
├── compare_images/           # Compare Images
│   └── system_v1.md
│
└── repair/                   # AI Repair Data
    ├── system_v1.md          # Base system prompt
    ├── context_healthcare.md # HIPAA-specific rules
    ├── context_insurance.md  # Insurance-specific rules
    ├── context_finance.md    # Finance-specific rules
    └── context_general.md    # Default rules
```

## Prompt File Format

Each prompt file uses Markdown with YAML frontmatter for metadata:

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

Your prompt content here...
```

### Metadata Fields

| Field | Required | Description |
|-------|----------|-------------|
| version | Yes | Semantic version of the prompt |
| created | Yes | Creation date (YYYY-MM-DD) |
| author | Yes | Author or team name |
| node | Yes | Associated node type |
| description | Yes | Brief description |
| audit_required | No | Whether usage should be audited (default: true) |
| compliance_tags | No | Relevant compliance frameworks |

## Adding a New Prompt Version

1. **Create new version file:**
   ```bash
   cp prompts/repair/system_v1.md prompts/repair/system_v2.md
   ```

2. **Update metadata:**
   ```yaml
   ---
   version: "2.0"
   created: "2025-01-15"
   ...
   ```

3. **Test thoroughly:**
   - Run with test data
   - Verify audit logs
   - Check compliance requirements

4. **Update loader (optional):**
   - To make v2 default, update `PromptLoader.DEFAULT_VERSION`
   - Or specify version at runtime: `load_prompt("repair", version="v2")`

5. **Commit and document:**
   ```bash
   git add prompts/repair/system_v2.md
   git commit -m "Add repair prompt v2 with improved confidence scoring"
   ```

## Rolling Back Prompts

If a new prompt version causes issues:

1. **Update version reference:**
   ```python
   # In ai.py, change:
   prompt_result = build_full_prompt(
       node_type="repair",
       version="v1",  # Rollback from v2 to v1
       ...
   )
   ```

2. **Or delete problematic version:**
   ```bash
   git revert <commit-hash>
   ```

The versioned file system makes rollback trivial.

## LLM Provider Recommendations

### For Regulated Industries (HIPAA, SOX, PCI-DSS)

**Recommended: Azure OpenAI Service**
- Data stays in your Azure tenant
- BAA available for HIPAA
- SOC2, ISO 27001 certified
- Full audit logs

**Alternative: Ollama (On-Premise)**
- Data never leaves your network
- Complete control over infrastructure
- Models: llama2, mistral, mixtral
- Best for maximum privacy requirements

### For Non-Regulated Data

Any provider can be used:
- OpenAI API
- Anthropic Claude API
- Azure OpenAI
- Ollama

## Compliance Checklist

### HIPAA Compliance

- [ ] Use Azure OpenAI or Ollama (data stays private)
- [ ] Enable audit logging
- [ ] Use healthcare context for PHI data
- [ ] Review audit logs regularly
- [ ] Document data handling procedures

### SOC2 Compliance

- [ ] Maintain audit trail of all AI operations
- [ ] Version control for prompts
- [ ] Access controls for prompt modifications
- [ ] Regular review of prompt changes

### PCI-DSS Compliance

- [ ] Never process card numbers through AI
- [ ] Use finance context for financial data
- [ ] Mask sensitive data before AI processing
- [ ] Maintain audit logs for 1 year minimum

## Audit Log Format

Each prompt load generates a structured log entry:

```json
{
  "timestamp": "2025-12-18T10:30:00Z",
  "node_type": "ai.repair_data",
  "prompt_name": "system_v1",
  "prompt_version": "1.0",
  "prompt_checksum": "a1b2c3d4e5f6",
  "context": "healthcare",
  "provider": "azure_openai",
  "execution_id": "abc123",
  "user_config_hash": "def456",
  "metadata": {
    "author": "Skuldbot Team",
    "created": "2025-12-18"
  }
}
```

## Best Practices

1. **Never expose prompts to users**
   - Prompts are internal artifacts
   - Users configure intent, not implementation

2. **Test prompt changes thoroughly**
   - Use representative test data
   - Verify behavior across all contexts
   - Check edge cases

3. **Document significant changes**
   - Update version number
   - Add change description
   - Commit with meaningful message

4. **Review prompts regularly**
   - Check for outdated instructions
   - Verify compliance requirements
   - Update for new capabilities

5. **Monitor audit logs**
   - Set up alerts for anomalies
   - Review high-volume operations
   - Track prompt version usage

## Support

For questions about the prompt management system:
- Review this documentation
- Check the PromptLoader code in `skuldbot/ai/prompt_loader.py`
- Contact the Skuldbot team
