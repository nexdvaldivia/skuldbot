import {
  Credential,
  CredentialAccessLog,
  CredentialFolder,
  CredentialRotationHistory,
  VaultConnection,
} from '../credentials/entities/credential.entity';
import { Run, RunArtifact, RunEvent, RunLog, HitlRequest } from '../runs/entities/run.entity';
import { Auditor, AuditorAccessLog } from '../auditor/entities/auditor.entity';
import {
  Runner,
  RunnerEvent,
  RunnerHeartbeat,
  RunnerPool,
} from '../runners/entities/runner.entity';
import { Permission } from '../roles/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { TenantSettings } from '../settings/entities/tenant-settings.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Bot, BotVersion } from '../bots/entities/bot.entity';
import { ApiKey, RefreshToken, Session } from '../users/entities/api-key.entity';
import { User } from '../users/entities/user.entity';
import {
  EventTrigger,
  Schedule,
  ScheduleCalendarEntry,
  ScheduleExecution,
  ScheduleGroup,
  WebhookTrigger,
} from '../schedules/entities/schedule.entity';
import { BotInstallation } from '../marketplace/entities/bot-installation.entity';
import { UsageEvent } from '../usage/entities/usage-event.entity';

export const databaseEntities = [
  Credential,
  CredentialAccessLog,
  CredentialRotationHistory,
  CredentialFolder,
  VaultConnection,
  Run,
  RunEvent,
  RunLog,
  RunArtifact,
  HitlRequest,
  Auditor,
  AuditorAccessLog,
  Runner,
  RunnerPool,
  RunnerHeartbeat,
  RunnerEvent,
  Permission,
  Role,
  TenantSettings,
  AuditLog,
  Bot,
  BotVersion,
  ApiKey,
  RefreshToken,
  Session,
  User,
  Schedule,
  ScheduleExecution,
  EventTrigger,
  WebhookTrigger,
  ScheduleCalendarEntry,
  ScheduleGroup,
  BotInstallation,
  UsageEvent,
];
