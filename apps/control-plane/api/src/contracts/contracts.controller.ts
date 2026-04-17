import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { RequirePermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { User } from '../users/entities/user.entity';
import { ContractLookupsService } from './contract-lookups.service';
import { ContractRequirementService } from './contract-requirement.service';
import { ContractSignatoryPolicyService } from './contract-signatory-policy.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractTemplateService } from './contract-template.service';
import { ContractsService } from './contracts.service';
import {
  ContractLookupItemDto,
  ContractLegalInfoResponseDto,
  ContractLookupsResponseDto,
  ContractSignatoryResponseDto,
  ContractSignatoryInitialsResponseDto,
  ContractSignatorySignatureResponseDto,
  ContractSignatorySignatureUploadUrlResponseDto,
  BulkUpsertContractSignatoriesDto,
  CreateContractLookupDto,
  CreateContractSignatoryDto,
  ListContractLookupQueryDto,
  ListContractSignatoriesQueryDto,
  FindContractSignatoryForContractQueryDto,
  RequestContractSignatorySignatureUploadUrlDto,
  UploadContractSignatoryInitialsDto,
  UploadContractSignatorySignatureDto,
  UpdateContractSignatoryDto,
  UpdateContractLookupDto,
  UpdateContractLegalInfoDto,
} from './dto/legal.dto';
import {
  ConfigureContractRequirementsDto,
  ContractRequirementResponseDto,
  ListContractRequirementsQueryDto,
} from './dto/requirements.dto';
import {
  ContractAcceptanceResponseDto,
  ContractEnvelopeResponseDto,
  DeclineEnvelopeRecipientDto,
  ListContractAcceptancesQueryDto,
  ListSentContractsQueryDto,
  SignEnvelopeRecipientDto,
  VerifyEnvelopeOtpDto,
} from './dto/signing.dto';
import {
  ContractSignatoryPolicyListResponseDto,
  ContractSignatoryPolicyResponseDto,
  ContractSignatoryPolicyToggleResponseDto,
  ContractSignatoryResolutionPreviewRequestDto,
  ContractSignatoryResolutionPreviewResponseDto,
  CreateContractSignatoryPolicyDto,
  ListContractSignatoryPoliciesQueryDto,
  UpdateContractSignatoryPolicyDto,
} from './dto/signatory-policy.dto';
import {
  ContractTemplateResponseDto,
  CreateContractTemplateDto,
  DeprecateContractTemplateDto,
  PublishContractTemplateDto,
  SendTemplateForSignatureDto,
  UpdateContractTemplateDraftDto,
} from './dto/template.dto';
import {
  CancelContractDto,
  ContractResponseDto,
  CreateContractDto,
  ListContractsQueryDto,
  SubmitContractDto,
  UpdateContractDraftDto,
  UpdateSignerStatusDto,
} from './dto/contract.dto';
import { ContractLegalService } from './contract-legal.service';

@Controller('contracts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly contractTemplateService: ContractTemplateService,
    private readonly contractSigningService: ContractSigningService,
    private readonly contractLookupsService: ContractLookupsService,
    private readonly contractRequirementService: ContractRequirementService,
    private readonly contractLegalService: ContractLegalService,
    private readonly contractSignatoryPolicyService: ContractSignatoryPolicyService,
  ) {}

  @Get('templates')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listTemplates(): Promise<ContractTemplateResponseDto[]> {
    return this.contractTemplateService.listTemplates();
  }

  @Post('templates')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @Body() dto: CreateContractTemplateDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    return this.contractTemplateService.createTemplate(dto, currentUser);
  }

  @Get('templates/:templateId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getTemplateById(
    @Param('templateId') templateId: string,
  ): Promise<ContractTemplateResponseDto> {
    return this.contractTemplateService.getTemplateById(templateId);
  }

  @Patch('templates/:templateId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async updateTemplateDraft(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateContractTemplateDraftDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    return this.contractTemplateService.updateTemplateDraft(templateId, dto, currentUser);
  }

  @Post('templates/:templateId/publish')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async publishTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: PublishContractTemplateDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    return this.contractTemplateService.publishTemplate(templateId, dto, currentUser);
  }

  @Post('templates/:templateId/deprecate')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async deprecateTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: DeprecateContractTemplateDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    return this.contractTemplateService.deprecateTemplate(templateId, dto, currentUser);
  }

  @Post('templates/:templateId/send')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async sendTemplateForSignature(
    @Param('templateId') templateId: string,
    @Body() dto: SendTemplateForSignatureDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.sendTemplateForSignature(templateId, dto, currentUser);
  }

  @Get('sent')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listSent(
    @Query() query: ListSentContractsQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto[]> {
    return this.contractSigningService.listSentEnvelopes(query, currentUser);
  }

  @Get('sent/:envelopeId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getSentById(
    @Param('envelopeId') envelopeId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.getEnvelopeById(envelopeId, currentUser);
  }

  @Post('sent/:envelopeId/recipients/:recipientId/otp/verify')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async verifyRecipientOtp(
    @Param('envelopeId') envelopeId: string,
    @Param('recipientId') recipientId: string,
    @Body() dto: VerifyEnvelopeOtpDto,
    @CurrentUser() currentUser: User,
  ) {
    return this.contractSigningService.verifyEnvelopeRecipientOtp(
      envelopeId,
      recipientId,
      dto,
      currentUser,
    );
  }

  @Post('sent/:envelopeId/recipients/:recipientId/sign')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async signRecipient(
    @Param('envelopeId') envelopeId: string,
    @Param('recipientId') recipientId: string,
    @Body() dto: SignEnvelopeRecipientDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.signEnvelopeRecipient(
      envelopeId,
      recipientId,
      dto,
      currentUser,
    );
  }

  @Post('sent/:envelopeId/recipients/:recipientId/decline')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async declineRecipient(
    @Param('envelopeId') envelopeId: string,
    @Param('recipientId') recipientId: string,
    @Body() dto: DeclineEnvelopeRecipientDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.declineEnvelopeRecipient(
      envelopeId,
      recipientId,
      dto,
      currentUser,
    );
  }

  @Get('acceptances')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listAcceptances(
    @Query() query: ListContractAcceptancesQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractAcceptanceResponseDto[]> {
    return this.contractSigningService.listAcceptances(query, currentUser);
  }

  @Get('acceptances/:acceptanceId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getAcceptanceById(
    @Param('acceptanceId') acceptanceId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractAcceptanceResponseDto> {
    return this.contractSigningService.getAcceptanceById(acceptanceId, currentUser);
  }

  @Get('lookups')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getLookups(): Promise<ContractLookupsResponseDto> {
    return this.contractLookupsService.getContractLookups();
  }

  @Get('lookups/contract-types')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listContractTypes(
    @Query() query: ListContractLookupQueryDto,
  ): Promise<ContractLookupItemDto[]> {
    return this.contractLookupsService.listContractTypes(query.includeInactive ?? false);
  }

  @Post('lookups/contract-types')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  @HttpCode(HttpStatus.CREATED)
  async createContractType(
    @Body() dto: CreateContractLookupDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.contractLookupsService.createContractType(dto, currentUser);
  }

  @Patch('lookups/contract-types/:lookupId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async updateContractType(
    @Param('lookupId') lookupId: string,
    @Body() dto: UpdateContractLookupDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.contractLookupsService.updateContractType(lookupId, dto, currentUser);
  }

  @Get('lookups/jurisdictions')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listJurisdictions(
    @Query() query: ListContractLookupQueryDto,
  ): Promise<ContractLookupItemDto[]> {
    return this.contractLookupsService.listJurisdictions(query.includeInactive ?? false);
  }

  @Post('lookups/jurisdictions')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  @HttpCode(HttpStatus.CREATED)
  async createJurisdiction(
    @Body() dto: CreateContractLookupDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.contractLookupsService.createJurisdiction(dto, currentUser);
  }

  @Patch('lookups/jurisdictions/:lookupId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async updateJurisdiction(
    @Param('lookupId') lookupId: string,
    @Body() dto: UpdateContractLookupDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.contractLookupsService.updateJurisdiction(lookupId, dto, currentUser);
  }

  @Get('lookups/compliance-frameworks')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listComplianceFrameworks(
    @Query() query: ListContractLookupQueryDto,
  ): Promise<ContractLookupItemDto[]> {
    return this.contractLookupsService.listComplianceFrameworks(query.includeInactive ?? false);
  }

  @Post('lookups/compliance-frameworks')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  @HttpCode(HttpStatus.CREATED)
  async createComplianceFramework(
    @Body() dto: CreateContractLookupDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.contractLookupsService.createComplianceFramework(dto, currentUser);
  }

  @Patch('lookups/compliance-frameworks/:lookupId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async updateComplianceFramework(
    @Param('lookupId') lookupId: string,
    @Body() dto: UpdateContractLookupDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.contractLookupsService.updateComplianceFramework(lookupId, dto, currentUser);
  }

  @Get('requirements')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listRequirements(
    @Query() query: ListContractRequirementsQueryDto,
  ): Promise<ContractRequirementResponseDto[]> {
    return this.contractRequirementService.listRequirements(query);
  }

  @Post('requirements')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async configureRequirements(
    @Body() dto: ConfigureContractRequirementsDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractRequirementResponseDto[]> {
    return this.contractRequirementService.configureRequirements(dto, currentUser);
  }

  @Get('legal-info')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getLegalInfo(): Promise<ContractLegalInfoResponseDto> {
    return this.contractLegalService.getLegalInfo();
  }

  @Put('legal-info')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async updateLegalInfo(
    @Body() dto: UpdateContractLegalInfoDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractLegalInfoResponseDto> {
    return this.contractLegalService.updateLegalInfo(dto, currentUser);
  }

  @Get('signatories')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listSignatories(
    @Query() query: ListContractSignatoriesQueryDto,
  ): Promise<ContractSignatoryResponseDto[]> {
    return this.contractLegalService.listSignatories(
      query.onlyActive ?? false,
      query.includeDeleted ?? false,
    );
  }

  @Get('signatories/default')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getDefaultSignatory(): Promise<ContractSignatoryResponseDto> {
    return this.contractLegalService.getDefaultSignatory();
  }

  @Get('signatories/for-contract')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getSignatoryForContract(
    @Query() query: FindContractSignatoryForContractQueryDto,
  ): Promise<ContractSignatoryResponseDto> {
    return this.contractLegalService.findSignatoryForContract(query);
  }

  @Get('signatories/:signatoryId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getSignatoryById(
    @Param('signatoryId') signatoryId: string,
  ): Promise<ContractSignatoryResponseDto> {
    return this.contractLegalService.getSignatoryById(signatoryId);
  }

  @Post('signatories')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  @HttpCode(HttpStatus.CREATED)
  async createSignatory(
    @Body() dto: CreateContractSignatoryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryResponseDto> {
    return this.contractLegalService.createSignatory(dto, currentUser);
  }

  @Post('signatories/bulk-upsert')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async bulkUpsertSignatories(
    @Body() dto: BulkUpsertContractSignatoriesDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryResponseDto[]> {
    return this.contractLegalService.bulkUpsertSignatories(dto.signatories, currentUser);
  }

  @Patch('signatories/:signatoryId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async updateSignatory(
    @Param('signatoryId') signatoryId: string,
    @Body() dto: UpdateContractSignatoryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryResponseDto> {
    return this.contractLegalService.updateSignatory(signatoryId, dto, currentUser);
  }

  @Post('signatories/:signatoryId/set-default')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async setDefaultSignatory(
    @Param('signatoryId') signatoryId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryResponseDto> {
    return this.contractLegalService.setDefaultSignatory(signatoryId, currentUser);
  }

  @Delete('signatories/:signatoryId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSignatory(@Param('signatoryId') signatoryId: string): Promise<void> {
    await this.contractLegalService.removeSignatory(signatoryId);
  }

  @Post('signatories/:signatoryId/signature/upload-url')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async requestSignatorySignatureUploadUrl(
    @Param('signatoryId') signatoryId: string,
    @Body() dto: RequestContractSignatorySignatureUploadUrlDto,
  ): Promise<ContractSignatorySignatureUploadUrlResponseDto> {
    return this.contractLegalService.requestSignatorySignatureUploadUrl(signatoryId, dto);
  }

  @Post('signatories/:signatoryId/signature')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async uploadSignatorySignature(
    @Param('signatoryId') signatoryId: string,
    @Body() dto: UploadContractSignatorySignatureDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatorySignatureResponseDto> {
    return this.contractLegalService.uploadSignatorySignature(signatoryId, dto, currentUser);
  }

  @Post('signatories/:signatoryId/initials')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async uploadSignatoryInitials(
    @Param('signatoryId') signatoryId: string,
    @Body() dto: UploadContractSignatoryInitialsDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryInitialsResponseDto> {
    return this.contractLegalService.uploadSignatoryInitials(signatoryId, dto, currentUser);
  }

  @Get('signatories/:signatoryId/signature')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getSignatorySignature(
    @Param('signatoryId') signatoryId: string,
  ): Promise<ContractSignatorySignatureResponseDto> {
    return this.contractLegalService.getSignatorySignature(signatoryId);
  }

  @Delete('signatories/:signatoryId/signature')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async removeSignatorySignature(
    @Param('signatoryId') signatoryId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatorySignatureResponseDto> {
    return this.contractLegalService.removeSignatorySignature(signatoryId, currentUser);
  }

  @Get('signatory-policies')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listSignatoryPolicies(
    @Query() query: ListContractSignatoryPoliciesQueryDto,
  ): Promise<ContractSignatoryPolicyListResponseDto> {
    return this.contractSignatoryPolicyService.listPolicies(query.contractType, query.isActive);
  }

  @Get('signatory-policies/history')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listSignatoryPolicyHistory(
    @Query() query: ListContractSignatoryPoliciesQueryDto,
  ): Promise<ContractSignatoryPolicyListResponseDto> {
    return this.contractSignatoryPolicyService.listPolicyHistory(query.contractType);
  }

  @Get('signatory-policies/:policyId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getSignatoryPolicy(
    @Param('policyId') policyId: string,
  ): Promise<ContractSignatoryPolicyResponseDto> {
    return this.contractSignatoryPolicyService.getPolicy(policyId);
  }

  @Post('signatory-policies')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  @HttpCode(HttpStatus.CREATED)
  async createSignatoryPolicy(
    @Body() dto: CreateContractSignatoryPolicyDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryPolicyResponseDto> {
    return this.contractSignatoryPolicyService.createPolicy(dto, currentUser);
  }

  @Patch('signatory-policies/:policyId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async updateSignatoryPolicy(
    @Param('policyId') policyId: string,
    @Body() dto: UpdateContractSignatoryPolicyDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryPolicyResponseDto> {
    return this.contractSignatoryPolicyService.updatePolicy(policyId, dto, currentUser);
  }

  @Post('signatory-policies/:policyId/activate')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async activateSignatoryPolicy(
    @Param('policyId') policyId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryPolicyToggleResponseDto> {
    return this.contractSignatoryPolicyService.activatePolicy(policyId, currentUser);
  }

  @Post('signatory-policies/:policyId/deactivate')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async deactivateSignatoryPolicy(
    @Param('policyId') policyId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractSignatoryPolicyToggleResponseDto> {
    return this.contractSignatoryPolicyService.deactivatePolicy(policyId, currentUser);
  }

  @Post('signatory-policies/resolve-preview')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async resolveSignatoryPolicyPreview(
    @Body() dto: ContractSignatoryResolutionPreviewRequestDto,
  ): Promise<ContractSignatoryResolutionPreviewResponseDto> {
    return this.contractSignatoryPolicyService.resolvePreview(dto);
  }

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

  @Patch(':contractId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async updateDraft(
    @Param('contractId') contractId: string,
    @Body() dto: UpdateContractDraftDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractResponseDto> {
    return this.contractsService.updateContractDraft(contractId, dto, currentUser);
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

  @Post(':contractId/generate-pdf')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async generatePdf(
    @Param('contractId') contractId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractResponseDto> {
    return this.contractsService.generatePdf(contractId, currentUser);
  }

  @Get(':contractId/pdf')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  @Header('Cache-Control', 'no-store')
  async downloadPdf(
    @Param('contractId') contractId: string,
    @CurrentUser() currentUser: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.contractsService.downloadPdf(contractId, currentUser);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return new StreamableFile(buffer);
  }
}
