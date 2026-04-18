import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ContractRenewalRequirementStatus } from '../entities/contract-domain.enums';

export class RequireReacceptanceDto {
  @IsUUID()
  templateId: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  notifyImmediately?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  customDeadlineDays?: number;
}

export class RequireReacceptanceResponseDto {
  success: boolean;
  newTemplateId: string;
  oldTemplateId: string | null;
  requirementsCreated: number;
  notificationsSent: number;
  clientsAffected: Array<{
    clientId: string;
    clientName: string;
    email: string | null;
    deadline: string;
  }>;
}

export class WaiveRequirementDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}

export class WaiveRequirementResponseDto {
  success: boolean;
  requirementId: string;
  waivedAt: string;
  waivedBy: string | null;
  reason: string;
}

export class ListContractRenewalRequirementsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(Object.values(ContractRenewalRequirementStatus))
  statusFilter?: ContractRenewalRequirementStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class PendingContractInfoDto {
  requirementId: string;
  templateId: string;
  templateName: string;
  templateDisplayName: string;
  contractType: string;
  version: string;
  deadline: string;
  daysRemaining: number;
  notifiedAt: string | null;
  reminderSentAt: string | null;
}

export class PendingContractsResponseDto {
  clientId: string;
  clientName: string;
  pendingCount: number;
  pendingContracts: PendingContractInfoDto[];
}

export class AcceptPendingContractDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  signerName: string;

  @IsEmail()
  @MaxLength(180)
  signerEmail: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  signerTitle: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  signerPhone?: string;
}

export class AcceptPendingContractResponseDto {
  success: boolean;
  requirementId: string;
  acceptanceId: string;
  acceptedAt: string;
  pdfUrl: string | null;
}

export class ProcessContractRenewalJobResponseDto {
  success: boolean;
  jobType: string;
  results: Record<string, unknown>;
}
