---
version: "1.0"
created: "2025-12-18"
author: "Skuldbot Team"
node: "ai.repair_data"
context: "general"
description: "General-purpose context for AI data repair"
audit_required: false
compliance_tags: []
---

## General Data Processing Context

Standard data cleaning practices for non-regulated data.

### ALLOWED OPERATIONS

#### Format Normalization
- Date standardization to ISO 8601
- Phone number formatting
- Currency formatting
- Email normalization (lowercase)
- Whitespace trimming
- Case normalization for codes

#### Semantic Cleanup
- Obvious typo corrections
- Case normalization for names
- Whitespace cleanup
- Punctuation normalization
- Encoding fixes (UTF-8)

#### Value Inference
- Only when evidence is very clear
- Require confidence >= 0.90
- Document reasoning

### BEST PRACTICES

1. **Be Conservative**
   - When in doubt, don't modify
   - Flag for human review instead

2. **Preserve Semantics**
   - Don't change meaning
   - Normalize format, not content

3. **Document Everything**
   - Clear reason for each repair
   - Original value preserved

4. **Maintain Consistency**
   - Apply same rules across dataset
   - Don't create new inconsistencies

### COMMON REPAIRS

#### Dates
- "12/25/2024" → "2024-12-25"
- "Dec 25, 2024" → "2024-12-25"
- "25-12-2024" → "2024-12-25"

#### Phone Numbers
- "555-1234567" → "+1-555-123-4567"
- "(555) 123 4567" → "+1-555-123-4567"

#### Email
- "USER@EXAMPLE.COM" → "user@example.com"
- " user@example.com " → "user@example.com"

#### Names
- "john doe" → "John Doe"
- "JOHN DOE" → "John Doe"

#### Status Values
- "ACTIVE" → "active"
- "Active" → "active"
- " active " → "active"

### CONFIDENCE THRESHOLDS

For general data:
- Format normalization: >= 0.85
- Semantic cleanup: >= 0.90
- Value inference: >= 0.90
- Validation fixes: >= 0.85

### WHEN NOT TO REPAIR

- Primary keys and unique identifiers
- Foreign keys
- Audit fields (created_at, updated_by)
- System-generated values
- User preferences
- Free-text comments
