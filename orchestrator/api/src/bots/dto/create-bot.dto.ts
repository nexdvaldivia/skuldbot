import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
  IsEnum,
  IsNumber,
  IsUUID,
  MinLength,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BotStatus, BotCategory } from '../entities/bot.entity';

// ============================================================================
// NOTIFICATION CONFIG DTO
// ============================================================================

export class NotificationChannelDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @IsEnum(['email', 'slack', 'teams', 'webhook'], { each: true })
  channels: ('email' | 'slack' | 'teams' | 'webhook')[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];
}

export class BotNotificationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelDto)
  onSuccess?: NotificationChannelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelDto)
  onFailure?: NotificationChannelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelDto)
  onTimeout?: NotificationChannelDto;
}

// ============================================================================
// CREATE BOT DTO
// ============================================================================

export class CreateBotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(BotCategory)
  category?: BotCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @IsString()
  color?: string;

  // Execution config
  @IsOptional()
  @IsUUID()
  defaultRunnerId?: string;

  @IsOptional()
  @IsUUID()
  runnerGroupId?: string;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(3600)
  timeoutSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(3600)
  retryDelaySeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;

  @IsOptional()
  @IsObject()
  environmentVariables?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  credentialIds?: string[];

  // Trigger config
  @IsOptional()
  @IsBoolean()
  allowManualTrigger?: boolean;

  @IsOptional()
  @IsBoolean()
  allowApiTrigger?: boolean;

  @IsOptional()
  @IsBoolean()
  allowWebhookTrigger?: boolean;

  // Access control
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  sharedWithUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  sharedWithRoleIds?: string[];

  // Notifications
  @IsOptional()
  @ValidateNested()
  @Type(() => BotNotificationsDto)
  notifications?: BotNotificationsDto;

  // Metadata
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;

  @IsOptional()
  @IsUUID()
  folderId?: string;
}

// ============================================================================
// UPDATE BOT DTO
// ============================================================================

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(BotStatus)
  status?: BotStatus;

  @IsOptional()
  @IsEnum(BotCategory)
  category?: BotCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @IsString()
  color?: string;

  // Execution config
  @IsOptional()
  @IsUUID()
  defaultRunnerId?: string;

  @IsOptional()
  @IsUUID()
  runnerGroupId?: string;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(3600)
  timeoutSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(3600)
  retryDelaySeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;

  @IsOptional()
  @IsObject()
  environmentVariables?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  credentialIds?: string[];

  // Trigger config
  @IsOptional()
  @IsBoolean()
  allowManualTrigger?: boolean;

  @IsOptional()
  @IsBoolean()
  allowApiTrigger?: boolean;

  @IsOptional()
  @IsBoolean()
  allowWebhookTrigger?: boolean;

  // Access control
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  sharedWithUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  sharedWithRoleIds?: string[];

  // Notifications
  @IsOptional()
  @ValidateNested()
  @Type(() => BotNotificationsDto)
  notifications?: BotNotificationsDto;

  // Organization
  @IsOptional()
  @IsUUID()
  folderId?: string;

  // Metadata
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}

// ============================================================================
// CREATE BOT VERSION DTO
// ============================================================================

export class CreateBotVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  version: string; // semver: 1.0.0

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeNotes?: string;

  @IsObject()
  dsl: Record<string, any>; // BotDSL

  @IsOptional()
  @IsObject()
  ui?: Record<string, any>; // React Flow state

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

// ============================================================================
// UPDATE BOT VERSION DTO
// ============================================================================

export class UpdateBotVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeNotes?: string;

  @IsOptional()
  @IsObject()
  dsl?: Record<string, any>;

  @IsOptional()
  @IsObject()
  ui?: Record<string, any>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

// ============================================================================
// PUBLISH VERSION DTO
// ============================================================================

export class PublishVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  releaseNotes?: string;

  @IsOptional()
  @IsBoolean()
  setAsActive?: boolean; // Set this version as active bot version
}

// ============================================================================
// DEPRECATE VERSION DTO
// ============================================================================

export class DeprecateVersionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}

// ============================================================================
// QUERY DTOs
// ============================================================================

export class ListBotsQueryDto {
  @IsOptional()
  @IsEnum(BotStatus)
  status?: BotStatus;

  @IsOptional()
  @IsEnum(BotCategory)
  category?: BotCategory;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  favoritesOnly?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsEnum(['name', 'createdAt', 'updatedAt', 'lastRunAt', 'totalRuns'])
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'totalRuns';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class BotSummaryDto {
  id: string;
  name: string;
  description?: string;
  status: BotStatus;
  category: BotCategory;
  tags: string[];
  iconUrl?: string;
  color?: string;
  createdBy: string;
  creatorEmail?: string;
  currentVersionId?: string;
  currentVersion?: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  lastRunAt?: Date;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class BotDetailDto extends BotSummaryDto {
  draftVersionId?: string;
  totalVersions: number;
  defaultRunnerId?: string;
  runnerGroupId?: string;
  timeoutSeconds: number;
  maxRetries: number;
  retryDelaySeconds: number;
  priority: number;
  environmentVariables?: Record<string, string>;
  credentialIds: string[];
  allowManualTrigger: boolean;
  allowApiTrigger: boolean;
  allowWebhookTrigger: boolean;
  webhookUrl?: string; // Generated webhook URL
  isPublic: boolean;
  sharedWithUserIds: string[];
  sharedWithRoleIds: string[];
  notifications?: BotNotificationsDto;
  folderId?: string;
  avgDurationSeconds: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  viewCount: number;
  metadata?: Record<string, any>;
  settings?: Record<string, any>;
  archivedAt?: Date;
  archivedBy?: string;
}

export class BotVersionSummaryDto {
  id: string;
  version: string;
  label?: string;
  status: string;
  isPublished: boolean;
  nodeCount: number;
  edgeCount: number;
  totalRuns: number;
  successfulRuns: number;
  createdBy: string;
  creatorEmail?: string;
  publishedAt?: Date;
  publishedBy?: string;
  createdAt: Date;
}

export class BotVersionDetailDto extends BotVersionSummaryDto {
  changeNotes?: string;
  dsl: Record<string, any>;
  ui?: Record<string, any>;
  compiledPlan?: Record<string, any>;
  planHash?: string;
  compiledAt?: Date;
  compilationErrors?: string[];
  compilationWarnings?: string[];
  nodeTypes?: Record<string, number>;
  avgDurationSeconds: number;
  metadata?: Record<string, any>;
  deprecatedAt?: Date;
  deprecatedBy?: string;
  deprecationReason?: string;
  updatedAt: Date;
}

export class PaginatedBotsDto {
  bots: BotSummaryDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// EXPORT/IMPORT DTOs
// ============================================================================

export class ExportBotDto {
  @IsOptional()
  @IsBoolean()
  includeAllVersions?: boolean;

  @IsOptional()
  @IsBoolean()
  includeMetadata?: boolean;

  @IsOptional()
  @IsBoolean()
  includeSettings?: boolean;
}

export class ImportBotDto {
  @IsObject()
  exportData: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  newName?: string; // Override name on import

  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean;
}

export class BotExportDataDto {
  exportVersion: string;
  exportedAt: string;
  bot: {
    name: string;
    description?: string;
    category: BotCategory;
    tags: string[];
    timeoutSeconds: number;
    maxRetries: number;
    retryDelaySeconds: number;
    priority: number;
    allowManualTrigger: boolean;
    allowApiTrigger: boolean;
    allowWebhookTrigger: boolean;
    notifications?: BotNotificationsDto;
    metadata?: Record<string, any>;
    settings?: Record<string, any>;
  };
  versions: {
    version: string;
    label?: string;
    changeNotes?: string;
    dsl: Record<string, any>;
    ui?: Record<string, any>;
    metadata?: Record<string, any>;
    isPublished: boolean;
  }[];
}

// ============================================================================
// CLONE BOT DTO
// ============================================================================

export class CloneBotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  includeAllVersions?: boolean;
}

// ============================================================================
// SHARE BOT DTO
// ============================================================================

export class ShareBotDto {
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds?: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

// ============================================================================
// FAVORITE DTO
// ============================================================================

export class ToggleFavoriteDto {
  @IsBoolean()
  isFavorite: boolean;
}
