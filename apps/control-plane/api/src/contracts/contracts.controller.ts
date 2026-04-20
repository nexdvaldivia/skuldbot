import {
  BadRequestException,
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
  ContractRequirementTemplateSummaryDto,
  ContractValidationResponseDto,
  ConfigureContractRequirementsDto,
  ContractRequirementResponseDto,
  GetRequiredContractsForVerticalQueryDto,
  GetRequiredContractsQueryDto,
  ListContractRequirementsQueryDto,
  RenderContractForClientResponseDto,
  ValidateAddonContractsDto,
  ValidateSubscriptionContractsDto,
  ValidateVerticalContractsDto,
} from './dto/requirements.dto';
import {
  AcceptContractDto,
  ClientContractStatusResponseDto,
  CompleteEnvelopeOfflineDto,
  ContractAcceptanceResponseDto,
  CreateEnvelopeDto,
  CreateEnvelopeFromTemplatesDto,
  CreateSigningDocumentDto,
  EnvelopeDeliveryHistoryResponseDto,
  EnvelopeStatusSummaryDto,
  ContractEvidenceVerificationResponseDto,
  ContractEnvelopeResponseDto,
  CountersignAcceptanceDto,
  DeclineEnvelopeRecipientDto,
  ListContractAcceptancesQueryDto,
  ListSentContractsQueryDto,
  ReassignEnvelopeRecipientDto,
  RenderedAcceptanceResponseDto,
  ResendEnvelopeDto,
  RevokeAcceptanceDto,
  SignEnvelopeRecipientDto,
  SigningDocumentResponseDto,
  UpdateEnvelopeDto,
  UpdateSigningDocumentDto,
  UploadEnvelopeOfflineEvidenceDto,
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
  ContractTemplateLintResponseDto,
  ContractTemplatePdfPreviewResponseDto,
  ContractTemplateGroupedListResponseDto,
  ContractTemplateResponseDto,
  ContractTemplateSignatureFieldsResponseDto,
  ContractTemplateVariableCatalogResponseDto,
  ContractTemplateVariablesResponseDto,
  ContractTemplateVersionChainResponseDto,
  CreateContractTemplateVersionDto,
  CreateContractTemplateDto,
  DeprecateContractTemplateDto,
  ListContractTemplatesGroupedQueryDto,
  ListContractTemplatesQueryDto,
  ListTemplateVersionChainQueryDto,
  PublishContractTemplateDto,
  ResolveTemplateVariablesDto,
  ResolveTemplateVariablesResponseDto,
  SendTemplateForSignatureDto,
  UpdateTemplateSignatureFieldsDto,
  UploadTemplatePdfDto,
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
import { resolveEffectiveClientScope } from './contracts-access.util';

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
  async listTemplates(
    @Query() query: ListContractTemplatesQueryDto,
  ): Promise<ContractTemplateResponseDto[]> {
    return this.contractTemplateService.listTemplates(query.includeArchived ?? false);
  }

  @Get('grouped')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listTemplatesGrouped(
    @Query() query: ListContractTemplatesGroupedQueryDto,
  ): Promise<ContractTemplateGroupedListResponseDto> {
    return this.contractTemplateService.listTemplatesGrouped(query.includeArchived ?? false);
  }

  @Get('by-name/:templateKey/version-chain')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getTemplateVersionChain(
    @Param('templateKey') templateKey: string,
    @Query() query: ListTemplateVersionChainQueryDto,
  ): Promise<ContractTemplateVersionChainResponseDto> {
    return this.contractTemplateService.getTemplateVersionChainByTemplateKey(
      templateKey,
      query.includeArchived ?? false,
    );
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

  @Post('templates/:templateId/new-version')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async createTemplateVersion(
    @Param('templateId') templateId: string,
    @Body() dto: CreateContractTemplateVersionDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    return this.contractTemplateService.createTemplateVersion(templateId, dto, currentUser);
  }

  @Delete('templates/:templateId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async archiveTemplate(
    @Param('templateId') templateId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    return this.contractTemplateService.archiveTemplate(templateId, currentUser);
  }

  @Get('templates/:templateId/variables')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getTemplateVariables(
    @Param('templateId') templateId: string,
  ): Promise<ContractTemplateVariablesResponseDto> {
    return this.contractTemplateService.getTemplateVariables(templateId);
  }

  @Get('templates/:templateId/variables/catalog')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getTemplateVariableCatalog(
    @Param('templateId') templateId: string,
  ): Promise<ContractTemplateVariableCatalogResponseDto> {
    return this.contractTemplateService.getTemplateVariableCatalog(templateId);
  }

  @Post('templates/:templateId/lint')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async lintTemplate(
    @Param('templateId') templateId: string,
  ): Promise<ContractTemplateLintResponseDto> {
    return this.contractTemplateService.lintTemplate(templateId);
  }

  @Post('templates/:templateId/variables/resolve')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async resolveTemplateVariables(
    @Param('templateId') templateId: string,
    @Body() dto: ResolveTemplateVariablesDto,
  ): Promise<ResolveTemplateVariablesResponseDto> {
    return this.contractTemplateService.resolveTemplateVariables(templateId, dto);
  }

  @Post('templates/:templateId/upload-pdf')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async uploadTemplatePdf(
    @Param('templateId') templateId: string,
    @Body() dto: UploadTemplatePdfDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplatePdfPreviewResponseDto> {
    return this.contractTemplateService.uploadTemplatePdf(templateId, dto, currentUser);
  }

  @Get('templates/:templateId/preview-pdf')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async previewTemplatePdf(
    @Param('templateId') templateId: string,
  ): Promise<ContractTemplatePdfPreviewResponseDto> {
    return this.contractTemplateService.previewTemplatePdf(templateId);
  }

  @Delete('templates/:templateId/pdf')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async removeTemplatePdf(
    @Param('templateId') templateId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplatePdfPreviewResponseDto> {
    return this.contractTemplateService.removeTemplatePdf(templateId, currentUser);
  }

  @Put('templates/:templateId/signature-fields')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async updateTemplateSignatureFields(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateSignatureFieldsDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractTemplateSignatureFieldsResponseDto> {
    return this.contractTemplateService.updateTemplateSignatureFields(templateId, dto, currentUser);
  }

  @Get('templates/:templateId/render/:clientId')
  @RequirePermission(CP_PERMISSIONS.CONTRACTS_READ, {
    scope: 'client',
    source: 'params',
    key: 'clientId',
  })
  async renderTemplateForClient(
    @Param('templateId') templateId: string,
    @Param('clientId') clientId: string,
  ): Promise<RenderContractForClientResponseDto> {
    return this.contractRequirementService.renderTemplateForClient(templateId, clientId);
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

  @Post('envelopes')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createEnvelope(
    @Body() dto: CreateEnvelopeDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.createEnvelope(dto, currentUser);
  }

  @Post('envelopes/from-templates')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createEnvelopeFromTemplates(
    @Body() dto: CreateEnvelopeFromTemplatesDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.createEnvelopeFromTemplates(dto, currentUser);
  }

  @Patch('envelopes/:envelopeId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async updateEnvelope(
    @Param('envelopeId') envelopeId: string,
    @Body() dto: UpdateEnvelopeDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.updateEnvelope(envelopeId, dto, currentUser);
  }

  @Get('envelopes/:envelopeId/status')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getEnvelopeStatus(
    @Param('envelopeId') envelopeId: string,
    @CurrentUser() currentUser: User,
  ): Promise<EnvelopeStatusSummaryDto> {
    return this.contractSigningService.getEnvelopeStatusSummary(envelopeId, currentUser);
  }

  @Post('envelopes/:envelopeId/void')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async voidEnvelope(
    @Param('envelopeId') envelopeId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.voidEnvelope(envelopeId, currentUser);
  }

  @Post('envelopes/:envelopeId/suspend')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async suspendEnvelope(
    @Param('envelopeId') envelopeId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.suspendEnvelope(envelopeId, currentUser);
  }

  @Post('envelopes/:envelopeId/resume')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async resumeEnvelope(
    @Param('envelopeId') envelopeId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.resumeEnvelope(envelopeId, currentUser);
  }

  @Post('envelopes/:envelopeId/reassign-recipient')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async reassignEnvelopeRecipient(
    @Param('envelopeId') envelopeId: string,
    @Body() dto: ReassignEnvelopeRecipientDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.reassignEnvelopeRecipient(envelopeId, dto, currentUser);
  }

  @Post('envelopes/:envelopeId/force-close')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_APPROVE)
  async forceCloseEnvelope(
    @Param('envelopeId') envelopeId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.forceCloseEnvelope(envelopeId, currentUser);
  }

  @Post('envelopes/:envelopeId/resend')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async resendEnvelope(
    @Param('envelopeId') envelopeId: string,
    @Body() dto: ResendEnvelopeDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.resendEnvelope(envelopeId, dto, currentUser);
  }

  @Get('envelopes/:envelopeId/delivery-history')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getEnvelopeDeliveryHistory(
    @Param('envelopeId') envelopeId: string,
    @CurrentUser() currentUser: User,
  ): Promise<EnvelopeDeliveryHistoryResponseDto> {
    return this.contractSigningService.getEnvelopeDeliveryHistory(envelopeId, currentUser);
  }

  @Post('envelopes/:envelopeId/offline-evidence/upload')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async uploadEnvelopeOfflineEvidence(
    @Param('envelopeId') envelopeId: string,
    @Body() dto: UploadEnvelopeOfflineEvidenceDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.uploadEnvelopeOfflineEvidence(envelopeId, dto, currentUser);
  }

  @Post('envelopes/:envelopeId/complete-offline')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async completeEnvelopeOffline(
    @Param('envelopeId') envelopeId: string,
    @Body() dto: CompleteEnvelopeOfflineDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    return this.contractSigningService.completeEnvelopeOffline(envelopeId, dto, currentUser);
  }

  @Post('envelopes/:envelopeId/documents')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async addEnvelopeDocument(
    @Param('envelopeId') envelopeId: string,
    @Body() dto: CreateSigningDocumentDto,
    @CurrentUser() currentUser: User,
  ): Promise<SigningDocumentResponseDto> {
    return this.contractSigningService.addEnvelopeDocument(envelopeId, dto, currentUser);
  }

  @Get('envelopes/:envelopeId/documents/:docId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getEnvelopeDocument(
    @Param('envelopeId') envelopeId: string,
    @Param('docId') docId: string,
    @CurrentUser() currentUser: User,
  ): Promise<SigningDocumentResponseDto> {
    return this.contractSigningService.getEnvelopeDocument(envelopeId, docId, currentUser);
  }

  @Patch('envelopes/:envelopeId/documents/:docId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  async updateEnvelopeDocument(
    @Param('envelopeId') envelopeId: string,
    @Param('docId') docId: string,
    @Body() dto: UpdateSigningDocumentDto,
    @CurrentUser() currentUser: User,
  ): Promise<SigningDocumentResponseDto> {
    return this.contractSigningService.updateEnvelopeDocument(envelopeId, docId, dto, currentUser);
  }

  @Delete('envelopes/:envelopeId/documents/:docId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEnvelopeDocument(
    @Param('envelopeId') envelopeId: string,
    @Param('docId') docId: string,
    @CurrentUser() currentUser: User,
  ): Promise<void> {
    await this.contractSigningService.deleteEnvelopeDocument(envelopeId, docId, currentUser);
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

  @Post('accept')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  @HttpCode(HttpStatus.CREATED)
  async acceptContract(
    @Body() dto: AcceptContractDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractAcceptanceResponseDto> {
    return this.contractSigningService.acceptContract(dto, currentUser);
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

  @Get('acceptances/:acceptanceId/evidence/verify')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async verifyAcceptanceEvidence(
    @Param('acceptanceId') acceptanceId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ContractEvidenceVerificationResponseDto> {
    return this.contractSigningService.verifyAcceptanceEvidence(acceptanceId, currentUser);
  }

  @Post('acceptances/:acceptanceId/countersign')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async countersignAcceptance(
    @Param('acceptanceId') acceptanceId: string,
    @Body() dto: CountersignAcceptanceDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractAcceptanceResponseDto> {
    return this.contractSigningService.countersignAcceptance(acceptanceId, dto, currentUser);
  }

  @Post('acceptances/:acceptanceId/revoke')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_SIGN)
  async revokeAcceptance(
    @Param('acceptanceId') acceptanceId: string,
    @Body() dto: RevokeAcceptanceDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractAcceptanceResponseDto> {
    return this.contractSigningService.revokeAcceptance(acceptanceId, dto, currentUser);
  }

  @Get('client/:clientId/status')
  @RequirePermission(CP_PERMISSIONS.CONTRACTS_READ, {
    scope: 'client',
    source: 'params',
    key: 'clientId',
  })
  async getClientContractStatus(
    @Param('clientId') clientId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContractStatusResponseDto> {
    return this.contractSigningService.getClientContractStatus(clientId, currentUser);
  }

  @Get('acceptances/:acceptanceId/rendered')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getRenderedAcceptance(
    @Param('acceptanceId') acceptanceId: string,
    @CurrentUser() currentUser: User,
  ): Promise<RenderedAcceptanceResponseDto> {
    return this.contractSigningService.getRenderedAcceptance(acceptanceId, currentUser);
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

  @Post('validate')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async validateContractsForSubscription(
    @Body() dto: ValidateSubscriptionContractsDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractValidationResponseDto> {
    const effectiveClientId = resolveEffectiveClientScope(dto.clientId, currentUser);
    if (!effectiveClientId) {
      throw new BadRequestException({
        code: 'CLIENT_SCOPE_REQUIRED',
        message: 'Client scope is required for contract validation.',
      });
    }
    return this.contractRequirementService.validateSubscriptionContracts(dto, effectiveClientId);
  }

  @Get('required')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getRequiredContracts(
    @Query() query: GetRequiredContractsQueryDto,
  ): Promise<ContractRequirementTemplateSummaryDto[]> {
    return this.contractRequirementService.getRequiredContractsForSubscription(query);
  }

  @Post('validate/vertical')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async validateContractsForVertical(
    @Body() dto: ValidateVerticalContractsDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractValidationResponseDto> {
    const effectiveClientId = resolveEffectiveClientScope(dto.clientId, currentUser);
    if (!effectiveClientId) {
      throw new BadRequestException({
        code: 'CLIENT_SCOPE_REQUIRED',
        message: 'Client scope is required for contract validation.',
      });
    }
    return this.contractRequirementService.validateVerticalContracts(dto, effectiveClientId);
  }

  @Get('required/vertical/:verticalSlug')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getRequiredContractsForVertical(
    @Param('verticalSlug') verticalSlug: string,
    @Query() query: GetRequiredContractsForVerticalQueryDto,
  ): Promise<ContractRequirementTemplateSummaryDto[]> {
    return this.contractRequirementService.getRequiredContractsForVertical(verticalSlug, query);
  }

  @Post('validate/addon')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async validateContractsForAddon(
    @Body() dto: ValidateAddonContractsDto,
    @CurrentUser() currentUser: User,
  ): Promise<ContractValidationResponseDto> {
    const effectiveClientId = resolveEffectiveClientScope(dto.clientId, currentUser);
    if (!effectiveClientId) {
      throw new BadRequestException({
        code: 'CLIENT_SCOPE_REQUIRED',
        message: 'Client scope is required for contract validation.',
      });
    }
    return this.contractRequirementService.validateAddonContracts(dto, effectiveClientId);
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

  @Post('signatory-policies/resolve-preview')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async resolveSignatoryPolicyPreview(
    @Body() dto: ContractSignatoryResolutionPreviewRequestDto,
  ): Promise<ContractSignatoryResolutionPreviewResponseDto> {
    return this.contractSignatoryPolicyService.resolvePreview(dto);
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
