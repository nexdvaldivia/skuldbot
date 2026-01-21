import { Classification, ControlType } from './classification';

/**
 * Tenant Policy Pack - Rules for a specific tenant/industry
 */
export interface TenantPolicyPack {
  tenantId: string;
  version: string;
  industry?: string; // healthcare, finance, insurance, etc.

  defaults: {
    logging: {
      redact: boolean;
      storeDays: number;
    };
    artifacts: {
      encryptAtRest: boolean;
    };
  };

  rules: PolicyRule[];
}

/**
 * Policy Rule - When/Then condition
 */
export interface PolicyRule {
  id: string;
  description?: string;
  when: PolicyCondition;
  then: PolicyAction;
}

/**
 * Condition for when a rule applies
 */
export interface PolicyCondition {
  dataContains?: Classification[];
  nodeType?: string;
  nodeCategory?: string;
  capability?: 'egress' | 'writes' | 'deletes' | 'privilegedAccess';
  egress?: 'NONE' | 'INTERNAL' | 'EXTERNAL';
  writes?: 'NONE' | 'INTERNAL' | 'EXTERNAL';
  deletes?: boolean;
  privilegedAccess?: boolean;
  networkDomainMatches?: string;
}

/**
 * Action to take when rule matches
 */
export interface PolicyAction {
  action: 'BLOCK' | 'REQUIRE_CONTROLS' | 'WARN';
  controls?: ControlType[];
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message?: string;
}

/**
 * Result of policy evaluation
 */
export interface PolicyResult {
  blocks: PolicyViolation[];
  warnings: PolicyViolation[];
  requiresControls: Record<string, Set<ControlType>>;
}

export interface PolicyViolation {
  nodeId: string;
  ruleId: string;
  message: string;
  severity: string;
}

/**
 * Default HIPAA policy pack
 * For: Healthcare organizations handling Protected Health Information
 * Retention: 7 years (HIPAA §164.530(j))
 */
export const HIPAA_POLICY_PACK: TenantPolicyPack = {
  tenantId: 'default',
  version: '1.0.0',
  industry: 'healthcare',
  defaults: {
    logging: { redact: true, storeDays: 365 * 7 }, // 7 years for HIPAA
    artifacts: { encryptAtRest: true },
  },
  rules: [
    {
      id: 'HIPAA_NO_PHI_EXTERNAL',
      description: 'PHI cannot be sent to external destinations without controls',
      when: {
        dataContains: ['PHI'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['DLP_SCAN', 'HITL_APPROVAL', 'LOG_REDACTION', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'PHI egress requires DLP scan, human approval, and audit logging',
      },
    },
    {
      id: 'HIPAA_NO_PHI_TO_EXTERNAL_LLM',
      description: 'PHI cannot be sent to external LLM without redaction',
      when: {
        dataContains: ['PHI'],
        nodeCategory: 'ai',
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['REDACT', 'PROMPT_GUARD', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'PHI must be redacted before sending to external AI services',
      },
    },
    {
      id: 'HIPAA_PII_EMAIL',
      description: 'PII/PHI in emails requires approval',
      when: {
        dataContains: ['PII', 'PHI'],
        nodeType: 'email.send',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['DLP_SCAN', 'HITL_APPROVAL'],
        severity: 'HIGH',
        message: 'Emails containing PII/PHI require human approval',
      },
    },
    {
      id: 'HIPAA_ENCRYPT_PHI_STORAGE',
      description: 'PHI must be encrypted when stored',
      when: {
        dataContains: ['PHI'],
        writes: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'PHI must be encrypted at rest per HIPAA Security Rule §164.312(a)(2)(iv)',
      },
    },
    {
      id: 'HIPAA_PHI_DELETE_AUDIT',
      description: 'Deletion of PHI requires audit trail',
      when: {
        dataContains: ['PHI'],
        deletes: true,
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG', 'HITL_APPROVAL'],
        severity: 'HIGH',
        message: 'PHI deletion requires human approval and audit logging',
      },
    },
  ],
};

/**
 * SOC 2 Type II policy pack
 * For: SaaS companies, service providers requiring trust certifications
 * Based on: AICPA Trust Services Criteria (Security, Availability, Processing Integrity, Confidentiality, Privacy)
 * Retention: 1 year minimum for SOC 2 audits
 */
export const SOC2_POLICY_PACK: TenantPolicyPack = {
  tenantId: 'default',
  version: '1.0.0',
  industry: 'technology',
  defaults: {
    logging: { redact: true, storeDays: 365 }, // 1 year for SOC 2
    artifacts: { encryptAtRest: true },
  },
  rules: [
    // CC6.1 - Logical Access Security
    {
      id: 'SOC2_CC6_1_ACCESS_CONTROL',
      description: 'All system access must be logged (CC6.1)',
      when: {
        privilegedAccess: true,
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Privileged access requires audit logging per SOC 2 CC6.1',
      },
    },
    // CC6.6 - Security Events
    {
      id: 'SOC2_CC6_6_SECURITY_LOGGING',
      description: 'Security events must be logged and monitored (CC6.6)',
      when: {
        capability: 'egress',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'MEDIUM',
        message: 'External communications must be logged per SOC 2 CC6.6',
      },
    },
    // CC6.7 - Restrict Data Movement
    {
      id: 'SOC2_CC6_7_DATA_MOVEMENT',
      description: 'Sensitive data movement to external systems requires controls (CC6.7)',
      when: {
        dataContains: ['PII', 'CREDENTIALS'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['DLP_SCAN', 'AUDIT_LOG', 'ENCRYPT'],
        severity: 'HIGH',
        message: 'Sensitive data egress requires DLP and encryption per SOC 2 CC6.7',
      },
    },
    // CC7.2 - Anomaly Detection
    {
      id: 'SOC2_CC7_2_RATE_LIMIT',
      description: 'External API calls must have rate limiting (CC7.2)',
      when: {
        nodeCategory: 'api',
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['RATE_LIMIT', 'TIMEOUT_GUARD', 'AUDIT_LOG'],
        severity: 'MEDIUM',
        message: 'External API calls require rate limiting per SOC 2 CC7.2',
      },
    },
    // C1.1 - Confidentiality
    {
      id: 'SOC2_C1_1_CONFIDENTIALITY',
      description: 'Confidential information must be protected (C1.1)',
      when: {
        dataContains: ['CREDENTIALS'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'BLOCK',
        severity: 'CRITICAL',
        message: 'Credentials cannot be sent to external systems - use vault references',
      },
    },
    // PI1.1 - Personal Information
    {
      id: 'SOC2_PI1_1_PII_PROTECTION',
      description: 'PII must be handled according to privacy notice (PI1.1)',
      when: {
        dataContains: ['PII'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['DLP_SCAN', 'LOG_REDACTION', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'PII egress requires DLP scan and redacted logging per SOC 2 PI1.1',
      },
    },
    // A1.2 - Processing Integrity
    {
      id: 'SOC2_A1_2_DATA_VALIDATION',
      description: 'Data processing must be validated (A1.2)',
      when: {
        capability: 'writes',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'MEDIUM',
        message: 'Data writes must be logged for integrity verification per SOC 2 A1.2',
      },
    },
  ],
};

/**
 * PCI-DSS v4.0 policy pack
 * For: Organizations handling payment card data
 * Retention: 1 year minimum (Requirement 10.7)
 */
export const PCI_DSS_POLICY_PACK: TenantPolicyPack = {
  tenantId: 'default',
  version: '1.0.0',
  industry: 'finance',
  defaults: {
    logging: { redact: true, storeDays: 365 }, // 1 year for PCI-DSS
    artifacts: { encryptAtRest: true },
  },
  rules: [
    // Requirement 3.4 - Render PAN Unreadable
    {
      id: 'PCI_3_4_PAN_ENCRYPTION',
      description: 'PAN must be rendered unreadable anywhere it is stored (Req 3.4)',
      when: {
        dataContains: ['PCI'],
        writes: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'TOKENIZE', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Card data must be encrypted or tokenized before storage per PCI-DSS Req 3.4',
      },
    },
    // Requirement 3.5 - Key Management
    {
      id: 'PCI_3_5_KEY_MANAGEMENT',
      description: 'Cryptographic keys must be managed securely (Req 3.5)',
      when: {
        dataContains: ['CREDENTIALS'],
        nodeCategory: 'crypto',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['VAULT_STORE', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Encryption keys must be stored in vault per PCI-DSS Req 3.5',
      },
    },
    // Requirement 4.1 - Transmission Encryption
    {
      id: 'PCI_4_1_TRANSMISSION_ENCRYPTION',
      description: 'Card data must be encrypted during transmission (Req 4.1)',
      when: {
        dataContains: ['PCI'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'DLP_SCAN', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Card data transmission requires encryption per PCI-DSS Req 4.1',
      },
    },
    // Requirement 6.5 - Secure Development
    {
      id: 'PCI_6_5_SECURE_OUTPUT',
      description: 'Prevent exposure of sensitive data in logs/errors (Req 6.5)',
      when: {
        dataContains: ['PCI'],
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['LOG_REDACTION', 'MASK'],
        severity: 'HIGH',
        message: 'Card data must be masked in logs per PCI-DSS Req 6.5',
      },
    },
    // Requirement 7.1 - Access Control
    {
      id: 'PCI_7_1_ACCESS_CONTROL',
      description: 'Access to card data must be restricted (Req 7.1)',
      when: {
        dataContains: ['PCI'],
        privilegedAccess: true,
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['HITL_APPROVAL', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Access to card data requires approval per PCI-DSS Req 7.1',
      },
    },
    // Requirement 10.1 - Audit Trails
    {
      id: 'PCI_10_1_AUDIT_TRAIL',
      description: 'All access to cardholder data must be logged (Req 10.1)',
      when: {
        dataContains: ['PCI'],
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'All card data access must be logged per PCI-DSS Req 10.1',
      },
    },
    // Requirement 10.5 - Secure Audit Logs
    {
      id: 'PCI_10_5_SECURE_LOGS',
      description: 'Audit logs must be secured and tamper-evident (Req 10.5)',
      when: {
        dataContains: ['PCI'],
        capability: 'writes',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ARTIFACT_ENCRYPTION', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Audit logs must be encrypted and immutable per PCI-DSS Req 10.5',
      },
    },
    // Block PCI to external LLMs
    {
      id: 'PCI_NO_CARD_TO_LLM',
      description: 'Card data cannot be sent to external AI services',
      when: {
        dataContains: ['PCI'],
        nodeCategory: 'ai',
        egress: 'EXTERNAL',
      },
      then: {
        action: 'BLOCK',
        severity: 'CRITICAL',
        message: 'Payment card data CANNOT be sent to external AI services',
      },
    },
  ],
};

/**
 * GDPR policy pack
 * For: Organizations processing EU personal data
 * Based on: General Data Protection Regulation (EU) 2016/679
 * Retention: As specified by data minimization principle + legal requirements
 */
export const GDPR_POLICY_PACK: TenantPolicyPack = {
  tenantId: 'default',
  version: '1.0.0',
  industry: 'general',
  defaults: {
    logging: { redact: true, storeDays: 365 * 3 }, // 3 years typical for GDPR disputes
    artifacts: { encryptAtRest: true },
  },
  rules: [
    // Article 5(1)(f) - Integrity and Confidentiality
    {
      id: 'GDPR_ART5_INTEGRITY',
      description: 'Personal data must be processed securely (Art. 5(1)(f))',
      when: {
        dataContains: ['PII'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Personal data transfer requires encryption per GDPR Art. 5(1)(f)',
      },
    },
    // Article 17 - Right to Erasure
    {
      id: 'GDPR_ART17_ERASURE',
      description: 'Deletion of personal data must be logged (Art. 17)',
      when: {
        dataContains: ['PII'],
        deletes: true,
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'MEDIUM',
        message: 'Personal data deletion must be logged per GDPR Art. 17',
      },
    },
    // Article 25 - Data Protection by Design
    {
      id: 'GDPR_ART25_MINIMIZATION',
      description: 'Only necessary data should be processed (Art. 25)',
      when: {
        dataContains: ['PII'],
        nodeCategory: 'ai',
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['PSEUDONYMIZE', 'REDACT', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Personal data to external AI should be minimized per GDPR Art. 25',
      },
    },
    // Article 30 - Records of Processing
    {
      id: 'GDPR_ART30_PROCESSING_RECORDS',
      description: 'Processing activities must be recorded (Art. 30)',
      when: {
        dataContains: ['PII'],
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'MEDIUM',
        message: 'All PII processing must be logged per GDPR Art. 30',
      },
    },
    // Article 32 - Security of Processing
    {
      id: 'GDPR_ART32_SECURITY',
      description: 'Appropriate security measures required (Art. 32)',
      when: {
        dataContains: ['PII'],
        writes: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'PSEUDONYMIZE', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'PII storage requires encryption or pseudonymization per GDPR Art. 32',
      },
    },
    // Article 33 - Breach Notification
    {
      id: 'GDPR_ART33_BREACH_DETECTION',
      description: 'Data breaches must be detectable (Art. 33)',
      when: {
        dataContains: ['PII'],
        capability: 'egress',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['DLP_SCAN', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'PII egress requires DLP for breach detection per GDPR Art. 33',
      },
    },
    // Article 44-49 - International Transfers
    {
      id: 'GDPR_ART44_TRANSFER',
      description: 'Cross-border data transfers require safeguards (Art. 44-49)',
      when: {
        dataContains: ['PII'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'AUDIT_LOG', 'DLP_SCAN'],
        severity: 'HIGH',
        message: 'International PII transfer requires encryption and logging per GDPR Art. 44-49',
      },
    },
    // Special category data (Art. 9)
    {
      id: 'GDPR_ART9_SPECIAL_CATEGORY',
      description: 'Health data requires explicit consent and extra protection (Art. 9)',
      when: {
        dataContains: ['PHI'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['HITL_APPROVAL', 'ENCRYPT', 'PSEUDONYMIZE', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Health data (special category) requires explicit consent per GDPR Art. 9',
      },
    },
  ],
};

/**
 * Finance/Banking policy pack
 * For: Banks, investment firms, financial services
 * Based on: OCC guidelines, FFIEC, Dodd-Frank, SEC regulations
 * Retention: 7 years (SEC Rule 17a-4, BSA/AML)
 */
export const FINANCE_POLICY_PACK: TenantPolicyPack = {
  tenantId: 'default',
  version: '1.0.0',
  industry: 'finance',
  defaults: {
    logging: { redact: true, storeDays: 365 * 7 }, // 7 years for SEC/FINRA
    artifacts: { encryptAtRest: true },
  },
  rules: [
    // Account Numbers - Always sensitive
    {
      id: 'FIN_ACCOUNT_PROTECTION',
      description: 'Account numbers must be protected',
      when: {
        dataContains: ['PII'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['MASK', 'ENCRYPT', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Account numbers must be masked and encrypted when transmitted',
      },
    },
    // Wire Transfers - High risk
    {
      id: 'FIN_WIRE_TRANSFER',
      description: 'Wire transfer operations require dual approval',
      when: {
        nodeType: 'banking.wire_transfer',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['HITL_APPROVAL', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Wire transfers require human approval per OCC guidelines',
      },
    },
    // AML/KYC - Suspicious activity
    {
      id: 'FIN_AML_LOGGING',
      description: 'All financial transactions must be logged for AML',
      when: {
        nodeCategory: 'banking',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Transaction logging required for BSA/AML compliance',
      },
    },
    // Large Transactions
    {
      id: 'FIN_LARGE_TRANSACTION',
      description: 'Large transactions require additional controls',
      when: {
        nodeType: 'banking.transfer',
        privilegedAccess: true,
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['HITL_APPROVAL', 'DLP_SCAN', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Large transactions require dual approval per FFIEC guidelines',
      },
    },
    // No credentials to external
    {
      id: 'FIN_NO_CREDS_EXTERNAL',
      description: 'Banking credentials cannot leave internal systems',
      when: {
        dataContains: ['CREDENTIALS'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'BLOCK',
        severity: 'CRITICAL',
        message: 'Banking credentials cannot be sent to external systems',
      },
    },
    // Customer data to AI
    {
      id: 'FIN_CUSTOMER_DATA_AI',
      description: 'Customer financial data to external AI requires controls',
      when: {
        dataContains: ['PII'],
        nodeCategory: 'ai',
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['REDACT', 'PSEUDONYMIZE', 'PROMPT_GUARD', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Customer data must be anonymized before sending to external AI',
      },
    },
    // Trading Operations
    {
      id: 'FIN_TRADING_AUDIT',
      description: 'All trading operations must be audited',
      when: {
        nodeCategory: 'trading',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG', 'TIMEOUT_GUARD'],
        severity: 'CRITICAL',
        message: 'Trading operations require full audit trail per SEC Rule 17a-4',
      },
    },
    // Dodd-Frank - Derivatives
    {
      id: 'FIN_DERIVATIVES_REPORTING',
      description: 'Derivatives transactions require reporting',
      when: {
        nodeType: 'trading.derivative',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG', 'HITL_APPROVAL'],
        severity: 'HIGH',
        message: 'Derivatives require reporting per Dodd-Frank',
      },
    },
    // Data at rest encryption
    {
      id: 'FIN_DATA_AT_REST',
      description: 'All financial data must be encrypted at rest',
      when: {
        dataContains: ['PII', 'PCI'],
        writes: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'ARTIFACT_ENCRYPTION', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Financial data must be encrypted at rest per OCC/FFIEC guidelines',
      },
    },
  ],
};

/**
 * Insurance policy pack
 * For: Insurance carriers, brokers, claims processors
 * Based on: NAIC Model Laws, state insurance regulations
 * Retention: 7-10 years depending on policy type
 */
export const INSURANCE_POLICY_PACK: TenantPolicyPack = {
  tenantId: 'default',
  version: '1.0.0',
  industry: 'insurance',
  defaults: {
    logging: { redact: true, storeDays: 365 * 10 }, // 10 years for policy records
    artifacts: { encryptAtRest: true },
  },
  rules: [
    // Claims Processing - PHI/PII
    {
      id: 'INS_CLAIMS_PHI',
      description: 'Claims containing medical data require HIPAA controls',
      when: {
        dataContains: ['PHI'],
        nodeCategory: 'claims',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'LOG_REDACTION', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Medical claims data requires HIPAA-compliant handling',
      },
    },
    // FNOL - First Notice of Loss
    {
      id: 'INS_FNOL_LOGGING',
      description: 'FNOL must be logged with full audit trail',
      when: {
        nodeType: 'insurance.fnol',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'HIGH',
        message: 'FNOL events require complete audit trail',
      },
    },
    // Underwriting - Risk Assessment
    {
      id: 'INS_UNDERWRITING_AI',
      description: 'AI-assisted underwriting requires human review',
      when: {
        nodeCategory: 'ai',
        nodeType: 'insurance.underwriting',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['HITL_APPROVAL', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'AI underwriting decisions require human approval',
      },
    },
    // Policy Holder Data
    {
      id: 'INS_POLICYHOLDER_DATA',
      description: 'Policy holder PII must be protected',
      when: {
        dataContains: ['PII'],
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['ENCRYPT', 'DLP_SCAN', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Policy holder data requires encryption per NAIC Model Laws',
      },
    },
    // Fraud Detection
    {
      id: 'INS_FRAUD_LOGGING',
      description: 'Fraud detection operations must be logged',
      when: {
        nodeCategory: 'fraud',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['AUDIT_LOG'],
        severity: 'MEDIUM',
        message: 'Fraud detection requires audit trail for SIU',
      },
    },
    // Payment Processing
    {
      id: 'INS_PAYMENT_CONTROLS',
      description: 'Insurance payments require approval controls',
      when: {
        nodeType: 'insurance.payment',
        privilegedAccess: true,
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['HITL_APPROVAL', 'AUDIT_LOG'],
        severity: 'HIGH',
        message: 'Claim payments require approval per carrier guidelines',
      },
    },
    // External AI - Anonymization
    {
      id: 'INS_AI_ANONYMIZATION',
      description: 'Data sent to external AI must be anonymized',
      when: {
        dataContains: ['PII', 'PHI'],
        nodeCategory: 'ai',
        egress: 'EXTERNAL',
      },
      then: {
        action: 'REQUIRE_CONTROLS',
        controls: ['REDACT', 'PSEUDONYMIZE', 'PROMPT_GUARD', 'AUDIT_LOG'],
        severity: 'CRITICAL',
        message: 'Insurance data must be anonymized before external AI processing',
      },
    },
  ],
};

/**
 * Policy pack registry - maps industry/framework to policy pack
 */
export const POLICY_PACKS: Record<string, TenantPolicyPack> = {
  hipaa: HIPAA_POLICY_PACK,
  soc2: SOC2_POLICY_PACK,
  'pci-dss': PCI_DSS_POLICY_PACK,
  pci_dss: PCI_DSS_POLICY_PACK,
  gdpr: GDPR_POLICY_PACK,
  finance: FINANCE_POLICY_PACK,
  banking: FINANCE_POLICY_PACK,
  insurance: INSURANCE_POLICY_PACK,
  healthcare: HIPAA_POLICY_PACK,
};

/**
 * Get policy pack by name or industry
 */
export function getPolicyPack(name: string): TenantPolicyPack | undefined {
  return POLICY_PACKS[name.toLowerCase()];
}

/**
 * Combine multiple policy packs (for organizations with multiple compliance requirements)
 */
export function combinePolicyPacks(
  packs: TenantPolicyPack[],
  tenantId: string = 'combined',
): TenantPolicyPack {
  if (packs.length === 0) {
    throw new Error('At least one policy pack is required');
  }

  // Use the most restrictive defaults
  const maxRetention = Math.max(...packs.map((p) => p.defaults.logging.storeDays));
  const requiresRedaction = packs.some((p) => p.defaults.logging.redact);
  const requiresEncryption = packs.some((p) => p.defaults.artifacts.encryptAtRest);

  // Combine all rules
  const allRules = packs.flatMap((p) => p.rules);

  // Deduplicate by rule ID (keep first occurrence)
  const uniqueRules = allRules.filter(
    (rule, index, self) => self.findIndex((r) => r.id === rule.id) === index,
  );

  return {
    tenantId,
    version: '1.0.0',
    industry: 'combined',
    defaults: {
      logging: { redact: requiresRedaction, storeDays: maxRetention },
      artifacts: { encryptAtRest: requiresEncryption },
    },
    rules: uniqueRules,
  };
}
