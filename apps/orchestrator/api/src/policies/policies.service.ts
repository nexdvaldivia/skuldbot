import { Injectable } from '@nestjs/common';
import { TenantPolicyPack, HIPAA_POLICY_PACK } from '@skuldbot/compiler';

/**
 * Service for managing tenant policy packs
 * In the future, these could come from a database
 */
@Injectable()
export class PoliciesService {
  private policyPacks: Map<string, TenantPolicyPack> = new Map();

  constructor() {
    this.registerDefaultPolicyPacks();
  }

  /**
   * Get policy pack for a tenant
   */
  async getPolicyPackForTenant(tenantId: string): Promise<TenantPolicyPack> {
    // Check if tenant has a custom policy pack
    const customPack = this.policyPacks.get(tenantId);
    if (customPack) {
      return customPack;
    }

    // Return default HIPAA policy pack
    return {
      ...HIPAA_POLICY_PACK,
      tenantId,
    };
  }

  /**
   * Register a custom policy pack for a tenant
   */
  registerPolicyPack(pack: TenantPolicyPack): void {
    this.policyPacks.set(pack.tenantId, pack);
  }

  /**
   * Get all available policy pack templates
   */
  getAvailableTemplates(): Array<{ id: string; name: string; industry: string }> {
    return [
      { id: 'hipaa', name: 'HIPAA Compliance', industry: 'healthcare' },
      { id: 'pci-dss', name: 'PCI-DSS Compliance', industry: 'finance' },
      { id: 'soc2', name: 'SOC 2 Type II', industry: 'general' },
      { id: 'gdpr', name: 'GDPR Compliance', industry: 'general' },
      { id: 'minimal', name: 'Minimal (Development)', industry: 'development' },
    ];
  }

  /**
   * Get a policy pack template by ID
   */
  getTemplate(templateId: string): TenantPolicyPack | null {
    switch (templateId) {
      case 'hipaa':
        return HIPAA_POLICY_PACK;
      case 'pci-dss':
        return this.createPCIDSSPolicyPack();
      case 'soc2':
        return this.createSOC2PolicyPack();
      case 'gdpr':
        return this.createGDPRPolicyPack();
      case 'minimal':
        return this.createMinimalPolicyPack();
      default:
        return null;
    }
  }

  private registerDefaultPolicyPacks(): void {
    // Register default policy pack for 'default' tenant
    this.policyPacks.set('default', HIPAA_POLICY_PACK);
  }

  private createPCIDSSPolicyPack(): TenantPolicyPack {
    return {
      tenantId: 'template',
      version: '1.0.0',
      industry: 'finance',
      defaults: {
        logging: { redact: true, storeDays: 365 },
        artifacts: { encryptAtRest: true },
      },
      rules: [
        {
          id: 'PCI_NO_PAN_EXTERNAL',
          description: 'PCI data cannot be sent externally without encryption',
          when: {
            dataContains: ['PCI'],
            egress: 'EXTERNAL',
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['ENCRYPT', 'TOKENIZE', 'AUDIT_LOG'],
            severity: 'CRITICAL',
            message: 'PCI data must be encrypted or tokenized before external transmission',
          },
        },
        {
          id: 'PCI_NO_PAN_LOGS',
          description: 'PCI data cannot appear in logs',
          when: {
            dataContains: ['PCI'],
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['LOG_REDACTION', 'MASK'],
            severity: 'HIGH',
            message: 'PCI data must be masked in all logs',
          },
        },
        {
          id: 'PCI_AUDIT_ALL',
          description: 'All PCI operations must be audited',
          when: {
            dataContains: ['PCI'],
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['AUDIT_LOG'],
            severity: 'HIGH',
            message: 'All PCI data operations require audit logging',
          },
        },
      ],
    };
  }

  private createSOC2PolicyPack(): TenantPolicyPack {
    return {
      tenantId: 'template',
      version: '1.0.0',
      industry: 'general',
      defaults: {
        logging: { redact: true, storeDays: 365 },
        artifacts: { encryptAtRest: true },
      },
      rules: [
        {
          id: 'SOC2_AUDIT_EXTERNAL',
          description: 'External operations must be audited',
          when: {
            egress: 'EXTERNAL',
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['AUDIT_LOG'],
            severity: 'MEDIUM',
            message: 'External operations require audit logging',
          },
        },
        {
          id: 'SOC2_AUDIT_WRITES',
          description: 'Write operations must be audited',
          when: {
            capability: 'writes',
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['AUDIT_LOG'],
            severity: 'MEDIUM',
            message: 'Write operations require audit logging',
          },
        },
        {
          id: 'SOC2_SENSITIVE_DATA',
          description: 'Sensitive data requires encryption',
          when: {
            dataContains: ['PII', 'PHI', 'PCI'],
            capability: 'writes',
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['ARTIFACT_ENCRYPTION', 'AUDIT_LOG'],
            severity: 'HIGH',
            message: 'Sensitive data must be encrypted when stored',
          },
        },
      ],
    };
  }

  private createGDPRPolicyPack(): TenantPolicyPack {
    return {
      tenantId: 'template',
      version: '1.0.0',
      industry: 'general',
      defaults: {
        logging: { redact: true, storeDays: 365 * 3 }, // 3 years for GDPR
        artifacts: { encryptAtRest: true },
      },
      rules: [
        {
          id: 'GDPR_PII_EXTERNAL',
          description: 'PII cannot be transferred externally without consent/controls',
          when: {
            dataContains: ['PII'],
            egress: 'EXTERNAL',
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['HITL_APPROVAL', 'AUDIT_LOG', 'DLP_SCAN'],
            severity: 'CRITICAL',
            message: 'PII external transfer requires approval and audit',
          },
        },
        {
          id: 'GDPR_DATA_MINIMIZATION',
          description: 'PII should be minimized/pseudonymized when possible',
          when: {
            dataContains: ['PII'],
          },
          then: {
            action: 'WARN',
            severity: 'MEDIUM',
            message: 'Consider pseudonymization or data minimization for PII',
          },
        },
        {
          id: 'GDPR_AI_PII',
          description: 'PII in AI processing requires special handling',
          when: {
            dataContains: ['PII'],
            nodeCategory: 'ai',
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['PSEUDONYMIZE', 'AUDIT_LOG'],
            severity: 'HIGH',
            message: 'PII in AI processing should be pseudonymized',
          },
        },
      ],
    };
  }

  private createMinimalPolicyPack(): TenantPolicyPack {
    return {
      tenantId: 'template',
      version: '1.0.0',
      industry: 'development',
      defaults: {
        logging: { redact: false, storeDays: 30 },
        artifacts: { encryptAtRest: false },
      },
      rules: [
        {
          id: 'MINIMAL_CREDENTIALS',
          description: 'Credentials require vault storage',
          when: {
            dataContains: ['CREDENTIALS'],
          },
          then: {
            action: 'REQUIRE_CONTROLS',
            controls: ['VAULT_STORE'],
            severity: 'HIGH',
            message: 'Credentials must be stored in vault',
          },
        },
      ],
    };
  }
}
