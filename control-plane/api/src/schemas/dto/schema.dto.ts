import { IsString, IsArray, IsOptional, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SchemaFieldDto {
  @IsString()
  name: string;

  @IsString()
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaFieldDto)
  items?: SchemaFieldDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaFieldDto)
  fields?: SchemaFieldDto[];
}

export class SubmitSchemaDto {
  @IsString()
  nodeType: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaFieldDto)
  fields: SchemaFieldDto[];

  @IsOptional()
  @IsNumber()
  sampleCount?: number;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  orchestratorId?: string;
}

export class BulkSubmitSchemasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitSchemaDto)
  schemas: SubmitSchemaDto[];

  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  orchestratorId?: string;
}



