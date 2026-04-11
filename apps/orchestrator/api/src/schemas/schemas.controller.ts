import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { ControlPlaneSyncService, DiscoveredSchemaPayload } from '../control-plane/control-plane-sync.service';

interface SchemaFieldDto {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  items?: SchemaFieldDto[];
  fields?: SchemaFieldDto[];
}

interface SubmitSchemaDto {
  nodeType: string;
  fields: SchemaFieldDto[];
  sampleCount?: number;
  discoveredAt?: string;
}

interface SubmitSchemasDto {
  schemas: SubmitSchemaDto[];
}

/**
 * Schemas Controller
 * 
 * Receives discovered schemas from runners/engine and queues them
 * for synchronization to the Control Plane.
 */
@Controller('api/schemas')
export class SchemasController {
  private readonly logger = new Logger(SchemasController.name);

  constructor(
    private readonly controlPlaneSyncService: ControlPlaneSyncService,
  ) {}

  /**
   * Receive discovered schemas from a runner/engine execution
   * POST /api/schemas/discovered
   */
  @Post('discovered')
  async submitDiscoveredSchemas(@Body() dto: SubmitSchemasDto) {
    let processed = 0;
    const nodeTypes: string[] = [];

    for (const schema of dto.schemas) {
      this.controlPlaneSyncService.addDiscoveredSchema({
        nodeType: schema.nodeType,
        fields: schema.fields,
        sampleCount: schema.sampleCount || 1,
        discoveredAt: schema.discoveredAt ? new Date(schema.discoveredAt) : new Date(),
      });
      processed++;
      nodeTypes.push(schema.nodeType);
    }

    this.logger.log(`Received ${processed} discovered schemas: ${nodeTypes.join(', ')}`);

    return {
      success: true,
      processed,
      nodeTypes,
      message: 'Schemas queued for sync to Control Plane',
    };
  }

  /**
   * Get pending schemas (for debugging)
   * GET /api/schemas/pending
   */
  @Get('pending')
  async getPendingSchemas() {
    const schemas = this.controlPlaneSyncService.getPendingSchemas();
    return {
      count: schemas.length,
      schemas,
    };
  }

  /**
   * Force sync schemas to Control Plane immediately
   * POST /api/schemas/sync
   */
  @Post('sync')
  async forceSyncSchemas() {
    const result = await this.controlPlaneSyncService.forceSyncSchemas();
    return result;
  }
}



