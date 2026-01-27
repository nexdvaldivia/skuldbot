import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Header,
} from '@nestjs/common';
import { SchemasService } from './schemas.service';
import { SubmitSchemaDto, BulkSubmitSchemasDto } from './dto/schema.dto';

@Controller('schemas')
export class SchemasController {
  constructor(private readonly schemasService: SchemasService) {}

  /**
   * Submit a single discovered schema (from orchestrator)
   * POST /schemas
   */
  @Post()
  async submitSchema(@Body() dto: SubmitSchemaDto) {
    return this.schemasService.submitSchema(dto);
  }

  /**
   * Submit multiple schemas in bulk (from orchestrator sync)
   * POST /schemas/bulk
   */
  @Post('bulk')
  async submitBulkSchemas(@Body() dto: BulkSubmitSchemasDto) {
    return this.schemasService.submitBulkSchemas(dto);
  }

  /**
   * Get all discovered schemas
   * GET /schemas
   */
  @Get()
  async getAllSchemas() {
    return this.schemasService.getAllSchemas();
  }

  /**
   * Get schemas ready for next release
   * GET /schemas/for-release
   */
  @Get('for-release')
  async getSchemasForRelease() {
    return this.schemasService.getSchemasForRelease();
  }

  /**
   * Get schema for a specific node type
   * GET /schemas/:nodeType
   */
  @Get(':nodeType')
  async getSchemaByNodeType(@Param('nodeType') nodeType: string) {
    return this.schemasService.getSchemaByNodeType(nodeType);
  }

  /**
   * Export schemas as TypeScript code
   * GET /schemas/export/typescript
   */
  @Get('export/typescript')
  @Header('Content-Type', 'text/plain')
  async exportAsTypeScript() {
    return this.schemasService.exportAsTypeScript();
  }

  /**
   * Mark schemas as included in release
   * POST /schemas/mark-released
   */
  @Post('mark-released')
  async markAsReleased(@Body() body: { nodeTypes: string[]; version: string }) {
    await this.schemasService.markAsIncludedInRelease(body.nodeTypes, body.version);
    return { success: true };
  }
}


