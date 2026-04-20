import { IsOptional, IsString, Length, Matches } from 'class-validator';

const MFA_CODE_PATTERN = /^[0-9]{6}$/;
const BACKUP_CODE_PATTERN = /^[A-Za-z0-9-]{6,32}$/;

export class VerifyMfaCodeDto {
  @IsString()
  @Length(6, 32)
  @Matches(new RegExp(`${MFA_CODE_PATTERN.source}|${BACKUP_CODE_PATTERN.source}`))
  code: string;
}

export class DisableMfaDto {
  @IsString()
  @Length(6, 32)
  @Matches(new RegExp(`${MFA_CODE_PATTERN.source}|${BACKUP_CODE_PATTERN.source}`))
  code: string;
}

export class EnableMfaDto {
  @IsString()
  @Length(6, 6)
  @Matches(MFA_CODE_PATTERN)
  code: string;
}

export class SetupMfaDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  appName?: string;
}
