export enum ContractTemplateStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived',
}

export enum ContractEnvelopeStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  COMPLETED = 'completed',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum ContractEnvelopeRecipientStatus {
  PENDING = 'pending',
  SENT = 'sent',
  VIEWED = 'viewed',
  OTP_PENDING = 'otp_pending',
  OTP_VERIFIED = 'otp_verified',
  SIGNED = 'signed',
  DECLINED = 'declined',
}

export enum ContractSignatureType {
  TYPED = 'typed',
  DRAWN = 'drawn',
  UPLOAD = 'upload',
}

export enum ContractAcceptanceMethod {
  CLICKWRAP = 'clickwrap',
  ESIGN = 'esign',
  MANUAL = 'manual',
  IMPORTED = 'imported',
}

export enum ContractRequirementAction {
  DEPLOY_ORCHESTRATOR = 'deploy_orchestrator',
  LICENSE_CREATE = 'license_create',
  PROCESS_PHI = 'process_phi',
  PROCESS_EU_PII = 'process_eu_pii',
}

export enum ContractRenewalRequirementStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  WAIVED = 'waived',
}
