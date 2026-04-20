import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { User } from '../users/entities/user.entity';
import {
  AcceptPendingContractDto,
  AcceptPendingContractResponseDto,
  ListContractRenewalRequirementsQueryDto,
  PendingContractsResponseDto,
  ProcessContractRenewalJobResponseDto,
  RequireReacceptanceDto,
  RequireReacceptanceResponseDto,
  WaiveRequirementDto,
  WaiveRequirementResponseDto,
} from './dto/contract-renewals.dto';
import { ContractRenewalsService } from './contract-renewals.service';

@Controller('contract-renewals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContractRenewalsController {
  constructor(private readonly contractRenewalsService: ContractRenewalsService) {}

  @Post('admin/require-reacceptance')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async requireReacceptance(
    @Body() dto: RequireReacceptanceDto,
    @CurrentUser() currentUser: User,
  ): Promise<RequireReacceptanceResponseDto> {
    return this.contractRenewalsService.requireReacceptance(dto, currentUser);
  }

  @Post('admin/:requirementId/waive')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async waiveRequirement(
    @Param('requirementId') requirementId: string,
    @Body() dto: WaiveRequirementDto,
    @CurrentUser() currentUser: User,
  ): Promise<WaiveRequirementResponseDto> {
    return this.contractRenewalsService.waiveRequirement(requirementId, dto, currentUser);
  }

  @Get('admin/all')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listAllRequirements(
    @Query() query: ListContractRenewalRequirementsQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    return this.contractRenewalsService.listAllRequirements(query);
  }

  @Get('clients/:clientId/pending')
  @RequirePermission(CP_PERMISSIONS.CONTRACTS_READ, {
    scope: 'client',
    source: 'params',
    key: 'clientId',
  })
  async getPendingContracts(
    @Param('clientId') clientId: string,
    @CurrentUser() currentUser: User,
  ): Promise<PendingContractsResponseDto> {
    return this.contractRenewalsService.getPendingContractsForClient(clientId, currentUser);
  }

  @Post('clients/:clientId/accept/:requirementId')
  @RequirePermission(CP_PERMISSIONS.CONTRACTS_SIGN, {
    scope: 'client',
    source: 'params',
    key: 'clientId',
  })
  @HttpCode(HttpStatus.CREATED)
  async acceptPendingContract(
    @Param('clientId') clientId: string,
    @Param('requirementId') requirementId: string,
    @Body() dto: AcceptPendingContractDto,
    @CurrentUser() currentUser: User,
  ): Promise<AcceptPendingContractResponseDto> {
    return this.contractRenewalsService.acceptPendingContract(
      clientId,
      requirementId,
      dto,
      currentUser,
    );
  }

  @Post('admin/jobs/send-reminders')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async triggerSendReminders(
    @Query('daysBefore') daysBefore?: string,
  ): Promise<ProcessContractRenewalJobResponseDto> {
    const parsed = Number(daysBefore ?? '5');
    const daysBeforeDeadline = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 5;
    return this.contractRenewalsService.triggerSendReminders(daysBeforeDeadline);
  }

  @Post('admin/jobs/process-expired')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async triggerProcessExpired(): Promise<ProcessContractRenewalJobResponseDto> {
    return this.contractRenewalsService.triggerProcessExpired();
  }
}
