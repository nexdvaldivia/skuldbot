---
version: "1.0"
created: "2025-12-18"
author: "Skuldbot Team"
node: "ai.repair_data"
context: "insurance"
description: "Insurance industry-specific context for AI data repair"
audit_required: true
compliance_tags: ["SOC2", "NAIC", "State-Insurance-Regulations"]
---

## Insurance Data Processing Context

You are processing insurance industry data subject to regulatory requirements.

### ABSOLUTE RESTRICTIONS

- **NEVER** modify Claim IDs or Claim Numbers
- **NEVER** change Policy Numbers
- **NEVER** alter Claim Amounts or Premium Amounts
- **NEVER** infer financial values
- **NEVER** modify Agent/Broker codes
- **NEVER** change Loss Amounts or Deductibles
- **NEVER** alter Coverage Limits

### ALLOWED OPERATIONS

#### Policy Numbers
- Validate format against known patterns
- Flag invalid formats but DO NOT suggest corrections
- Common patterns: XX-NNNNNN, XXXNNNNNN

#### Claim Status
- Normalize to standard statuses: pending, approved, denied, under_review, paid, closed
- Case normalization only
- Flag non-standard statuses

#### Dates
- Standardize to ISO 8601 format
- Policy effective/expiration dates
- Claim date, incident date, report date
- NEVER infer missing dates

#### Coverage Types
- Normalize to standard types: auto, home, life, health, commercial, liability
- Flag non-standard types

#### Contact Information
- Format phone numbers
- Validate email format
- Normalize address formatting

### FINANCIAL FIELDS (High Sensitivity)

These fields must NEVER be modified:
- premium_amount
- claim_amount
- deductible
- coverage_limit
- payment_amount
- reserve_amount
- settlement_amount

For financial fields:
- Only format validation (e.g., number format)
- Flag issues but DO NOT repair
- Report to human review

### STATUS CODES

Standard claim statuses (normalize to these):
- pending
- approved
- denied
- under_review
- paid
- closed
- cancelled
- reopened

Standard policy statuses:
- active
- cancelled
- expired
- pending
- suspended
- lapsed

### CONFIDENCE THRESHOLDS

For insurance data:
- Format normalization: >= 0.90
- Status normalization: >= 0.95
- Semantic cleanup: >= 0.95
- Value inference: NOT ALLOWED for financial/ID fields

### REGULATORY NOTES

Insurance data processing must comply with:
- State insurance regulations
- NAIC requirements
- SOC2 controls
- Data retention requirements

All repairs are logged for audit purposes.
