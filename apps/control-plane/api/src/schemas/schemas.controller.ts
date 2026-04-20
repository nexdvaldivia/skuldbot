import { Controller, Get, Post, Body, Param, UseGuards, Header } from '@nestjs/common';
import { SchemasService } from './schemas.service';
import { SubmitSchemaDto, BulkSubmitSchemasDto } from './dto/schema.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';

@Controller('schemas')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SchemasController {
  constructor(private readonly schemasService: SchemasService) {}

  /**
   * Submit a single discovered schema (from orchestrator)
   * POST /schemas
   */
  @Post()
  @RequirePermissions(CP_PERMISSIONS.SCHEMAS_WRITE)
  async submitSchema(@Body() dto: SubmitSchemaDto) {
    return this.schemasService.submitSchema(dto);
  }

  /**
   * Submit multiple schemas in bulk (from orchestrator sync)
   * POST /schemas/bulk
   */
  @Post('bulk')
  @RequirePermissions(CP_PERMISSIONS.SCHEMAS_WRITE)
  async submitBulkSchemas(@Body() dto: BulkSubmitSchemasDto) {
    return this.schemasService.submitBulkSchemas(dto);
  }

  /**
   * Get all discovered schemas
   * GET /schemas
   */
  @Get()
  @RequirePermissions(CP_PERMISSIONS.SCHEMAS_READ)
  async getAllSchemas() {
    return this.schemasService.getAllSchemas();
  }

  /**
   * Get schemas ready for next release
   * GET /schemas/for-release
   */
  @Get('for-release')
  @RequirePermissions(CP_PERMISSIONS.SCHEMAS_READ)
  async getSchemasForRelease() {
    return this.schemasService.getSchemasForRelease();
  }

  /**
   * Export schemas as TypeScript code
   * GET /schemas/export/typescript
   */
  @Get('export/typescript')
  @RequirePermissions(CP_PERMISSIONS.SCHEMAS_READ)
  @Header('Content-Type', 'text/plain')
  async exportAsTypeScript() {
    return this.schemasService.exportAsTypeScript();
  }

  /**
   * Mark schemas as included in release
   * POST /schemas/mark-released
   */
  @Post('mark-released')
  @RequirePermissions(CP_PERMISSIONS.SCHEMAS_WRITE)
  async markAsReleased(@Body() body: { nodeTypes: string[]; version: string }) {
    await this.schemasService.markAsIncludedInRelease(body.nodeTypes, body.version);
    return { success: true };
  }

  /**
   * Get schema for a specific node type
   * GET /schemas/:nodeType
   */
  @Get(':nodeType')
  @RequirePermissions(CP_PERMISSIONS.SCHEMAS_READ)
  async getSchemaByNodeType(@Param('nodeType') nodeType: string) {
    return this.schemasService.getSchemaByNodeType(nodeType);
  }
}
