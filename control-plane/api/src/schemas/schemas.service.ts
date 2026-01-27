import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscoveredSchema, SchemaField } from './entities/discovered-schema.entity';
import { SubmitSchemaDto, BulkSubmitSchemasDto } from './dto/schema.dto';

@Injectable()
export class SchemasService {
  private readonly logger = new Logger(SchemasService.name);

  constructor(
    @InjectRepository(DiscoveredSchema)
    private schemasRepository: Repository<DiscoveredSchema>,
  ) {}

  /**
   * Submit a single discovered schema from an orchestrator
   */
  async submitSchema(dto: SubmitSchemaDto): Promise<DiscoveredSchema> {
    const existing = await this.schemasRepository.findOne({
      where: { nodeType: dto.nodeType },
    });

    if (existing) {
      // Merge schemas - combine fields from both
      const mergedFields = this.mergeSchemaFields(existing.fields, dto.fields as SchemaField[]);
      
      // Update contributor tracking
      const contributors = existing.contributorTenants || [];
      if (dto.tenantId && !contributors.includes(dto.tenantId)) {
        contributors.push(dto.tenantId);
      }

      existing.fields = mergedFields;
      existing.sampleCount += dto.sampleCount || 1;
      existing.contributorCount = contributors.length;
      existing.contributorTenants = contributors;
      existing.lastContributorTenant = dto.tenantId || null;

      this.logger.log(`Updated schema for ${dto.nodeType} from tenant ${dto.tenantId}`);
      return this.schemasRepository.save(existing);
    }

    // Create new schema
    const schema = this.schemasRepository.create({
      nodeType: dto.nodeType,
      fields: dto.fields as SchemaField[],
      sampleCount: dto.sampleCount || 1,
      contributorCount: dto.tenantId ? 1 : 0,
      contributorTenants: dto.tenantId ? [dto.tenantId] : null,
      lastContributorTenant: dto.tenantId || null,
    });

    this.logger.log(`Created new schema for ${dto.nodeType} from tenant ${dto.tenantId}`);
    return this.schemasRepository.save(schema);
  }

  /**
   * Submit multiple schemas in bulk (from orchestrator sync)
   */
  async submitBulkSchemas(dto: BulkSubmitSchemasDto): Promise<{ processed: number; nodeTypes: string[] }> {
    const nodeTypes: string[] = [];
    
    for (const schema of dto.schemas) {
      await this.submitSchema({
        ...schema,
        tenantId: dto.tenantId,
        orchestratorId: dto.orchestratorId,
      });
      nodeTypes.push(schema.nodeType);
    }

    this.logger.log(`Bulk processed ${dto.schemas.length} schemas from tenant ${dto.tenantId}`);
    return { processed: dto.schemas.length, nodeTypes };
  }

  /**
   * Get all discovered schemas
   */
  async getAllSchemas(): Promise<DiscoveredSchema[]> {
    return this.schemasRepository.find({
      order: { sampleCount: 'DESC' },
    });
  }

  /**
   * Get schemas ready to be included in next release
   */
  async getSchemasForRelease(): Promise<DiscoveredSchema[]> {
    return this.schemasRepository.find({
      where: { isIncludedInRelease: false },
      order: { contributorCount: 'DESC', sampleCount: 'DESC' },
    });
  }

  /**
   * Get schema for a specific node type
   */
  async getSchemaByNodeType(nodeType: string): Promise<DiscoveredSchema | null> {
    return this.schemasRepository.findOne({
      where: { nodeType },
    });
  }

  /**
   * Mark schemas as included in a release
   */
  async markAsIncludedInRelease(nodeTypes: string[], version: string): Promise<void> {
    await this.schemasRepository.update(
      { nodeType: nodeTypes as any },
      { isIncludedInRelease: true, includedInVersion: version },
    );
  }

  /**
   * Export schemas as TypeScript code for nodeTemplates.ts
   */
  async exportAsTypeScript(): Promise<string> {
    const schemas = await this.getSchemasForRelease();
    
    let code = '// Auto-generated from Schema Registry\n';
    code += '// Generated at: ' + new Date().toISOString() + '\n\n';
    code += 'export const discoveredOutputSchemas: Record<string, OutputField[]> = {\n';

    for (const schema of schemas) {
      code += `  "${schema.nodeType}": ${this.fieldsToTypeScript(schema.fields, 2)},\n`;
    }

    code += '};\n';
    return code;
  }

  /**
   * Merge two schema field arrays, combining unique fields
   */
  private mergeSchemaFields(existing: SchemaField[], incoming: SchemaField[]): SchemaField[] {
    const merged = new Map<string, SchemaField>();

    // Add existing fields
    for (const field of existing) {
      merged.set(field.name, field);
    }

    // Merge incoming fields
    for (const field of incoming) {
      const existingField = merged.get(field.name);
      if (existingField) {
        // Merge nested fields if both have them
        if (existingField.items && field.items) {
          existingField.items = this.mergeSchemaFields(existingField.items, field.items);
        }
        if (existingField.fields && field.fields) {
          existingField.fields = this.mergeSchemaFields(existingField.fields, field.fields);
        }
        // If incoming has nested but existing doesn't, add them
        if (!existingField.items && field.items) {
          existingField.items = field.items;
        }
        if (!existingField.fields && field.fields) {
          existingField.fields = field.fields;
        }
      } else {
        merged.set(field.name, field);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Convert schema fields to TypeScript code
   */
  private fieldsToTypeScript(fields: SchemaField[], indent: number): string {
    const spaces = '  '.repeat(indent);
    let code = '[\n';

    for (const field of fields) {
      code += `${spaces}  { name: "${field.name}", type: "${field.type}"`;
      
      if (field.items && field.items.length > 0) {
        code += `, items: { type: "object", fields: ${this.fieldsToTypeScript(field.items, indent + 2)} }`;
      }
      
      code += ' },\n';
    }

    code += `${spaces}]`;
    return code;
  }
}

