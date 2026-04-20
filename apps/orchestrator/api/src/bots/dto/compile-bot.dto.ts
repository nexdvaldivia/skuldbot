import { IsBoolean, IsOptional } from 'class-validator';

export class CompileBotDto {
  @IsOptional()
  @IsBoolean()
  failOnWarnings?: boolean;

  @IsOptional()
  @IsBoolean()
  force?: boolean; // Re-compile even if plan hash matches
}

export class CompileResultDto {
  success: boolean;
  planHash?: string;
  stepsCount?: number;
  errors: string[];
  warnings: string[];
  compiledAt?: string;
}
