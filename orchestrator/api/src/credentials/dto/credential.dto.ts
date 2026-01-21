import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsInt,
  IsArray,
  IsDateString,
  IsObject,
  MinLength,
  MaxLength,
  Matches,
  ValidateNested,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CredentialType,
  CredentialStatus,
  CredentialScope,
  VaultProvider,
} from '../entities/credential.entity';

// ═══════════════════════════════════════════════════════════════════════════════
// NESTED DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rotation configuration DTO
 */
export class RotationConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  intervalDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  notifyDaysBefore?: number;

  @IsOptional()
  @IsEnum(['manual', 'automatic', 'external'])
  rotationStrategy?: 'manual' | 'automatic' | 'external';

  @IsOptional()
  @IsString()
  rotationScript?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxFailures?: number;
}

/**
 * Audit configuration DTO
 */
export class AuditConfigDto {
  @IsBoolean()
  logAccess: boolean;

  @IsBoolean()
  logDecryption: boolean;

  @IsBoolean()
  alertOnUnauthorized: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(2555) // ~7 years
  retentionDays?: number;
}

/**
 * Credential metadata DTO
 */
export class CredentialMetadataDto {
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  database?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsObject()
  custom?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREDENTIAL VALUE DTOs (For storing actual secrets)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Username/Password credential value
 */
export class UsernamePasswordValueDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsString()
  domain?: string;
}

/**
 * API Key credential value
 */
export class ApiKeyValueDto {
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  @IsOptional()
  @IsString()
  headerName?: string;
}

/**
 * OAuth2 Client credential value
 */
export class OAuth2ClientValueDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  clientSecret: string;

  @IsOptional()
  @IsString()
  tokenUrl?: string;

  @IsOptional()
  @IsString()
  authorizationUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}

/**
 * OAuth2 Token credential value
 */
export class OAuth2TokenValueDto {
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  tokenType?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

/**
 * Database connection credential value
 */
export class DatabaseConnectionValueDto {
  @IsString()
  @IsNotEmpty()
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsString()
  @IsNotEmpty()
  database: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsBoolean()
  ssl?: boolean;

  @IsOptional()
  @IsString()
  sslCertificate?: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, any>;
}

/**
 * AWS credentials value
 */
export class AwsCredentialsValueDto {
  @IsString()
  @IsNotEmpty()
  accessKeyId: string;

  @IsString()
  @IsNotEmpty()
  secretAccessKey: string;

  @IsOptional()
  @IsString()
  sessionToken?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  roleArn?: string;
}

/**
 * Azure Service Principal value
 */
export class AzureServicePrincipalValueDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  clientSecret: string;

  @IsOptional()
  @IsString()
  subscriptionId?: string;
}

/**
 * GCP Service Account value
 */
export class GcpServiceAccountValueDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  privateKeyId: string;

  @IsString()
  @IsNotEmpty()
  privateKey: string;

  @IsString()
  @IsNotEmpty()
  clientEmail: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}

/**
 * Certificate credential value
 */
export class CertificateValueDto {
  @IsString()
  @IsNotEmpty()
  certificate: string;

  @IsOptional()
  @IsString()
  privateKey?: string;

  @IsOptional()
  @IsString()
  passphrase?: string;

  @IsOptional()
  @IsString()
  caCertificate?: string;
}

/**
 * SSH Key credential value
 */
export class SshKeyValueDto {
  @IsString()
  @IsNotEmpty()
  privateKey: string;

  @IsOptional()
  @IsString()
  publicKey?: string;

  @IsOptional()
  @IsString()
  passphrase?: string;

  @IsOptional()
  @IsString()
  username?: string;
}

/**
 * SMTP credentials value
 */
export class SmtpCredentialsValueDto {
  @IsString()
  @IsNotEmpty()
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsBoolean()
  ssl?: boolean;

  @IsOptional()
  @IsBoolean()
  tls?: boolean;

  @IsOptional()
  @IsString()
  fromAddress?: string;
}

/**
 * Generic secret value
 */
export class GenericSecretValueDto {
  @IsString()
  @IsNotEmpty()
  value: string;
}

/**
 * Key-value pairs value
 */
export class KeyValuePairsValueDto {
  @IsObject()
  values: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create credential DTO
 */
export class CreateCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(128)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Key must start with lowercase letter and contain only lowercase letters, numbers, and underscores',
  })
  key: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(CredentialType)
  type: CredentialType;

  @IsOptional()
  @IsEnum(CredentialScope)
  scope?: CredentialScope;

  @IsOptional()
  @IsEnum(VaultProvider)
  vaultProvider?: VaultProvider;

  @IsOptional()
  @IsString()
  vaultReference?: string;

  @IsOptional()
  @IsString()
  vaultConnectionId?: string;

  /**
   * The actual credential value (will be encrypted)
   * Type depends on credential type
   */
  @IsObject()
  value: Record<string, any>;

  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CredentialMetadataDto)
  metadata?: CredentialMetadataDto;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  allowedBotIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  allowedEnvironments?: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RotationConfigDto)
  rotationConfig?: RotationConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AuditConfigDto)
  auditConfig?: AuditConfigDto;

  @IsOptional()
  @IsUUID()
  folderId?: string;
}

/**
 * Update credential DTO
 */
export class UpdateCredentialDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(CredentialStatus)
  status?: CredentialStatus;

  @IsOptional()
  @IsEnum(CredentialScope)
  scope?: CredentialScope;

  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CredentialMetadataDto)
  metadata?: CredentialMetadataDto;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  allowedBotIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  allowedEnvironments?: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RotationConfigDto)
  rotationConfig?: RotationConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AuditConfigDto)
  auditConfig?: AuditConfigDto;

  @IsOptional()
  @IsUUID()
  folderId?: string | null;
}

/**
 * Update credential value DTO
 */
export class UpdateCredentialValueDto {
  @IsObject()
  value: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Rotate credential DTO
 */
export class RotateCredentialDto {
  @IsOptional()
  @IsObject()
  newValue?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List credentials query DTO
 */
export class ListCredentialsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CredentialType)
  type?: CredentialType;

  @IsOptional()
  @IsEnum(CredentialStatus)
  status?: CredentialStatus;

  @IsOptional()
  @IsEnum(CredentialScope)
  scope?: CredentialScope;

  @IsOptional()
  @IsEnum(VaultProvider)
  vaultProvider?: VaultProvider;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsUUID()
  botId?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  expiringSoon?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  @IsOptional()
  @IsEnum([
    'name',
    'key',
    'type',
    'status',
    'createdAt',
    'updatedAt',
    'expiresAt',
    'lastAccessedAt',
  ])
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

/**
 * List access logs query DTO
 */
export class ListAccessLogsQueryDto {
  @IsOptional()
  @IsUUID()
  credentialId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  runnerId?: string;

  @IsOptional()
  @IsUUID()
  runId?: string;

  @IsOptional()
  @IsUUID()
  botId?: string;

  @IsOptional()
  @IsEnum(['read', 'decrypt', 'update', 'delete', 'rotate', 'revoke'])
  action?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  success?: boolean;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Credential summary response (list view)
 */
export class CredentialSummaryDto {
  id: string;
  name: string;
  key: string;
  description: string | null;
  type: CredentialType;
  status: CredentialStatus;
  scope: CredentialScope;
  vaultProvider: VaultProvider;
  labels: Record<string, string>;
  expiresAt: Date | null;
  accessCount: number;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Credential detail response
 */
export class CredentialDetailDto extends CredentialSummaryDto {
  metadata: {
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    region?: string;
    environment?: string;
    service?: string;
    custom?: Record<string, any>;
  };
  allowedBotIds: string[];
  allowedEnvironments: string[];
  ownerUserId: string | null;
  rotationConfig: {
    enabled: boolean;
    intervalDays: number;
    notifyDaysBefore?: number;
    rotationStrategy?: string;
    lastRotatedAt?: Date;
    nextRotationAt?: Date;
    consecutiveFailures?: number;
    maxFailures?: number;
  } | null;
  auditConfig: {
    logAccess: boolean;
    logDecryption: boolean;
    alertOnUnauthorized: boolean;
    retentionDays?: number;
  };
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
}

/**
 * Decrypted credential response (for bot execution)
 */
export class DecryptedCredentialDto {
  id: string;
  key: string;
  type: CredentialType;
  value: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * Access log entry response
 */
export class CredentialAccessLogDto {
  id: string;
  credentialId: string;
  credentialName?: string;
  credentialKey?: string;
  userId: string | null;
  runnerId: string | null;
  runId: string | null;
  botId: string | null;
  action: string;
  success: boolean;
  denialReason: string | null;
  ipAddress: string | null;
  context: Record<string, any>;
  accessedAt: Date;
}

/**
 * Rotation history entry response
 */
export class CredentialRotationHistoryDto {
  id: string;
  credentialId: string;
  triggerType: string;
  initiatedBy: string | null;
  previousVersion: number;
  newVersion: number;
  success: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  metadata: Record<string, any>;
  rotatedAt: Date;
}

/**
 * Paginated credentials response
 */
export class PaginatedCredentialsDto {
  items: CredentialSummaryDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Paginated access logs response
 */
export class PaginatedAccessLogsDto {
  items: CredentialAccessLogDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Credential statistics
 */
export class CredentialStatsDto {
  total: number;
  byType: Record<CredentialType, number>;
  byStatus: Record<CredentialStatus, number>;
  byScope: Record<CredentialScope, number>;
  byVaultProvider: Record<VaultProvider, number>;
  expiringSoon: number; // Expiring in next 30 days
  expired: number;
  rotationDueSoon: number; // Rotation due in next 7 days
  accessedToday: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VAULT CONNECTION DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create vault connection DTO
 */
export class CreateVaultConnectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEnum(VaultProvider)
  provider: VaultProvider;

  /**
   * Provider-specific configuration
   */
  @IsObject()
  config: Record<string, any>;
}

/**
 * Update vault connection DTO
 */
export class UpdateVaultConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

/**
 * Vault connection response
 */
export class VaultConnectionDto {
  id: string;
  name: string;
  provider: VaultProvider;
  isActive: boolean;
  lastConnectedAt: Date | null;
  lastError: string | null;
  healthCheck: {
    enabled: boolean;
    intervalMinutes?: number;
    lastCheckAt?: Date;
    lastCheckSuccess?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOLDER DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create folder DTO
 */
export class CreateFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;
}

/**
 * Update folder DTO
 */
export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;
}

/**
 * Folder response
 */
export class FolderDto {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  description: string | null;
  icon: string | null;
  credentialCount?: number;
  childFolderCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Credential fetch request (internal - from runner)
 */
export class FetchCredentialDto {
  @IsUUID()
  runnerId: string;

  @IsUUID()
  runId: string;

  @IsUUID()
  botId: string;

  @IsString()
  credentialKey: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  nodeName?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;
}

/**
 * Bulk fetch credentials request
 */
export class BulkFetchCredentialsDto {
  @IsUUID()
  runnerId: string;

  @IsUUID()
  runId: string;

  @IsUUID()
  botId: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  credentialKeys: string[];

  @IsOptional()
  @IsString()
  environment?: string;
}

/**
 * Bulk credentials response
 */
export class BulkCredentialsResponseDto {
  credentials: Record<string, DecryptedCredentialDto>;
  errors: Record<string, string>;
}
