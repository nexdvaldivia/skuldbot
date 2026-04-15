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
import { RequirePermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { User } from '../users/entities/user.entity';
import {
  CancelContractDto,
  ContractResponseDto,
  CreateContractDto,
  ListContractsQueryDto,
  SubmitContractDto,
  UpdateSignerStatusDto,
} from './dto/contract.dto';
import { ContractsService } from './contracts.service';

@Controller('contracts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listContracts(
    @Query() query: ListContractsQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractResponseDto[]> {
    return this.contractsService.listContracts(query, currentUser);
  }

  @Get(':contractId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getById(
    @Param('contractId') contractId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractResponseDto> {
    return this.contractsService.getById(contractId, currentUser);
  }

  @Post()
  @RequirePermission(CP_PERMISSIONS.CONTRACTS_WRITE, {
    scope: 'client',
    source: 'body',
    key: 'clientId',
  })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateContractDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractResponseDto> {
    return this.contractsService.createContract(dto, currentUser);
  }

  @Post(':contractId/submit')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async submitForSignature(
    @Param('contractId') contractId: string,
    @Body() dto: SubmitContractDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractResponseDto> {
    return this.contractsService.submitForSignature(contractId, dto, currentUser);
  }

  @Post(':contractId/signers/:signerId/status')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async updateSignerStatus(
    @Param('contractId') contractId: string,
    @Param('signerId') signerId: string,
    @Body() dto: UpdateSignerStatusDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractResponseDto> {
    return this.contractsService.updateSignerStatus(contractId, signerId, dto, currentUser);
  }

  @Post(':contractId/cancel')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async cancel(
    @Param('contractId') contractId: string,
    @Body() dto: CancelContractDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractResponseDto> {
    return this.contractsService.cancelContract(contractId, dto, currentUser);
  }
}
