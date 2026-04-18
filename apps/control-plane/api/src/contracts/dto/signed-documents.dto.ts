import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class ListSignedDocumentsQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  documentType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SignedDocumentListItemDto {
  id: string;
  name: string;
  description: string | null;
  documentType: string;
  status: string;
  signedAt: Date | null;
  signedByName: string | null;
  signedByEmail: string | null;
  documentCount: number;
  createdAt: Date;
}

export class SignedDocumentListResponseDto {
  items: SignedDocumentListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export class SignedDocumentDetailSignerDto {
  name: string;
  email: string;
  signedAt: string | null;
  status: string;
}

export class SignedDocumentDetailDocumentDto {
  id: string;
  name: string;
  order: number;
}

export class SignedDocumentDetailResponseDto extends SignedDocumentListItemDto {
  htmlContent: string | null;
  signers: SignedDocumentDetailSignerDto[];
  documents: SignedDocumentDetailDocumentDto[];
}

export class SignedDocumentDownloadQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['html', 'pdf'])
  format?: 'html' | 'pdf';
}
