import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LicensesService } from './licenses.service';
import {
  EntitlementCheckDto,
  EntitlementCheckResponseDto,
  QuotaCheckDto,
  QuotaCheckResponseDto,
  QuotaConsumeDto,
  QuotaConsumeResponseDto,
} from './dto/license.dto';
import { OrchestratorFleetAuthGuard } from '../orchestrators/guards/orchestrator-fleet-auth.guard';

@Controller()
@UseGuards(OrchestratorFleetAuthGuard)
export class LicensingRuntimeController {
  constructor(private readonly licensesService: LicensesService) {}

  private runtimeContext(headers: { traceId?: string; orchestratorId?: string }) {
    return {
      traceId: headers.traceId,
      orchestratorId: headers.orchestratorId,
    };
  }

  @Post('entitlements/check')
  @HttpCode(HttpStatus.OK)
  async checkEntitlement(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Headers('x-trace-id') traceId: string,
    @Headers('x-orchestrator-id') orchestratorId: string,
    @Body() dto: EntitlementCheckDto,
  ): Promise<EntitlementCheckResponseDto> {
    if (tenantIdHeader?.trim() && tenantIdHeader !== dto.tenantId) {
      throw new BadRequestException('x-tenant-id header does not match body.tenantId');
    }
    return this.licensesService.checkEntitlement(
      dto.tenantId,
      dto.resourceType,
      dto.requestedCount ?? 1,
      this.runtimeContext({ traceId, orchestratorId }),
    );
  }

  @Post('quota/check')
  @HttpCode(HttpStatus.OK)
  async checkQuota(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Headers('x-trace-id') traceId: string,
    @Headers('x-orchestrator-id') orchestratorId: string,
    @Body() dto: QuotaCheckDto,
  ): Promise<QuotaCheckResponseDto> {
    if (tenantIdHeader?.trim() && tenantIdHeader !== dto.tenantId) {
      throw new BadRequestException('x-tenant-id header does not match body.tenantId');
    }
    return this.licensesService.checkQuota(
      dto.tenantId,
      dto.resourceType,
      dto.requestedAmount ?? 0,
      dto.period,
      this.runtimeContext({ traceId, orchestratorId }),
    );
  }

  @Post('quota/consume')
  @HttpCode(HttpStatus.OK)
  async consumeQuota(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Headers('x-trace-id') traceId: string,
    @Headers('x-orchestrator-id') orchestratorId: string,
    @Body() dto: QuotaConsumeDto,
  ): Promise<QuotaConsumeResponseDto> {
    if (tenantIdHeader?.trim() && tenantIdHeader !== dto.tenantId) {
      throw new BadRequestException('x-tenant-id header does not match body.tenantId');
    }
    return this.licensesService.consumeQuota(
      dto.tenantId,
      dto.resourceType,
      dto.amount,
      dto.period,
      this.runtimeContext({ traceId, orchestratorId }),
    );
  }
}
