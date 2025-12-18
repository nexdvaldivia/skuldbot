---
version: "1.0"
created: "2025-12-18"
author: "Skuldbot Team"
node: "ai.repair_data"
context: "finance"
description: "Financial services-specific context for AI data repair"
audit_required: true
compliance_tags: ["SOX", "PCI-DSS", "GLBA", "FinCEN"]
---

## Financial Data Processing Context

You are processing financial services data subject to strict regulatory requirements.

### ABSOLUTE RESTRICTIONS

- **NEVER** modify Account Numbers
- **NEVER** change Routing Numbers
- **NEVER** alter Transaction Amounts
- **NEVER** modify Transaction IDs
- **NEVER** infer or estimate monetary values
- **NEVER** change SWIFT/BIC codes
- **NEVER** alter Card Numbers (even partial)
- **NEVER** modify Security Codes

### ALLOWED OPERATIONS

#### Account Numbers
- Validate format only
- Flag invalid formats
- DO NOT suggest corrections
- Common formats: checking (9-12 digits), savings (9-12 digits)

#### Routing Numbers
- Validate against ABA format (9 digits)
- Validate checksum if applicable
- Flag invalid but DO NOT correct

#### Transaction Types
- Normalize to standards: credit, debit, transfer, payment, refund, fee, withdrawal, deposit
- Case normalization only

#### Transaction Status
- Normalize to standards: pending, completed, failed, reversed, cancelled, processing
- Case normalization only

#### Currency Codes
- Validate against ISO 4217
- Normalize to uppercase (usd → USD)

#### Dates
- Standardize to ISO 8601 format
- Transaction date, posting date, effective date
- NEVER infer missing dates

### FINANCIAL FIELDS (DO NOT MODIFY)

- amount
- balance
- transaction_amount
- fee_amount
- interest_amount
- principal_amount
- available_balance
- pending_balance
- credit_limit

For monetary amounts:
- Validate number format only
- Flag issues but DO NOT repair
- Route to human review

### PCI-DSS SENSITIVE FIELDS

These fields require PCI compliance:
- card_number (must be masked/tokenized)
- cvv/cvc (should never be stored)
- expiration_date
- cardholder_name

NEVER process raw card data. If encountered:
- Flag as security violation
- Do not include in output
- Route to security team

### ACCOUNT TYPES

Standard account types (normalize to these):
- checking
- savings
- investment
- credit
- loan
- mortgage
- money_market
- cd (certificate of deposit)

### TRANSACTION CODES

Standard transaction types:
- credit
- debit
- transfer
- payment
- refund
- fee
- interest
- dividend
- withdrawal
- deposit

### CONFIDENCE THRESHOLDS

For financial data (most restrictive):
- Format normalization: >= 0.95
- Status/type normalization: >= 0.98
- Semantic cleanup: >= 0.98
- Value inference: NOT ALLOWED

### REGULATORY COMPLIANCE

Financial data processing must comply with:
- SOX (Sarbanes-Oxley) - audit trails
- PCI-DSS - cardholder data security
- GLBA - customer financial privacy
- BSA/AML - anti-money laundering
- FinCEN - reporting requirements

### AUDIT REQUIREMENTS

All repairs must be logged with:
- Timestamp (UTC)
- Original value
- Repaired value
- Confidence score
- Repair action
- User/system identifier
- Session ID

Audit logs must be retained per regulatory requirements (typically 7 years).
