import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ContractSignerStatus } from '../entities/contract-signer.entity';
import { ContractStatus } from '../entities/contract.entity';

export class ContractSignerInputDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  fullName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  roleLabel: string;
}

export class CreateContractDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  templateKey: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  documentJson?: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractSignerInputDto)
  signers: ContractSignerInputDto[];
}

export class ListContractsQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;
}

export class SubmitContractDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  envelopeProvider: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  envelopeId?: string;
}

export class UpdateSignerStatusDto {
  @IsEnum(ContractSignerStatus)
  status: ContractSignerStatus;

  @IsOptional()
  @IsObject()
  audit?: Record<string, unknown>;
}

export class CancelContractDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

export class ContractSignerResponseDto {
  id: string;
  email: string;
  fullName: string;
  roleLabel: string;
  sortOrder: number;
  status: ContractSignerStatus;
  sentAt: Date | null;
  viewedAt: Date | null;
  signedAt: Date | null;
  declinedAt: Date | null;
}

export class ContractResponseDto {
  id: string;
  clientId: string;
  tenantId: string | null;
  title: string;
  templateKey: string;
  version: number;
  status: ContractStatus;
  variables: Record<string, unknown>;
  documentJson: Record<string, unknown>;
  renderedHtml: string | null;
  pdfPath: string | null;
  envelopeProvider: string | null;
  envelopeId: string | null;
  signedAt: Date | null;
  metadata: Record<string, unknown>;
  signers: ContractSignerResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}
