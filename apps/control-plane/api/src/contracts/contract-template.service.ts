import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import {
  IntegrationType,
  StorageProvider,
  UploadResult,
} from '../common/interfaces/integration.interface';
import { ProviderFactoryService } from '../integrations/provider-factory.service';
import { resolveProviderChain } from '../integrations/provider-chain.util';
import { User } from '../users/entities/user.entity';
import {
  ContractTemplateLintResponseDto,
  ContractTemplatePdfPreviewResponseDto,
  ContractTemplateGroupedListResponseDto,
  ContractTemplateGroupedResponseDto,
  ContractTemplateResponseDto,
  ContractTemplateSignatureFieldsResponseDto,
  ContractTemplateVariableCatalogResponseDto,
  ContractTemplateVariablesResponseDto,
  ContractTemplateVersionChainNodeDto,
  ContractTemplateVersionChainResponseDto,
  ContractTemplateVersionResponseDto,
  CreateContractTemplateVersionDto,
  CreateContractTemplateDto,
  DeprecateContractTemplateDto,
  PublishContractTemplateDto,
  ResolveTemplateVariablesDto,
  ResolveTemplateVariablesResponseDto,
  TemplateLintIssueDto,
  TemplateLintSeverity,
  TemplateSignatureFieldDto,
  TemplateVariableCatalogCategoryDto,
  TemplateVariableItemDto,
  TemplateVariableDefinitionDto,
  UpdateTemplateSignatureFieldsDto,
  UploadTemplatePdfDto,
  UpdateContractTemplateDraftDto,
} from './dto/template.dto';
import { ContractTemplateStatus } from './entities/contract-domain.enums';
import { ContractTemplate } from './entities/contract-template.entity';
import { ContractTemplateVersion } from './entities/contract-template-version.entity';
import { PdfService } from './pdf.service';

type TemplatePdfMetadata = {
  storageKey: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
  uploadedAt: string;
};

const TEMPLATE_VARIABLE_CATALOG: Array<{
  key: string;
  label: string;
  description: string;
  type: string;
  category: string;
}> = [
  {
    key: 'client_name',
    label: 'Client Name',
    description: 'Legal or commercial client name.',
    type: 'string',
    category: 'client',
  },
  {
    key: 'client_email',
    label: 'Client Email',
    description: 'Primary client contact email.',
    type: 'string',
    category: 'client',
  },
  {
    key: 'tenant_name',
    label: 'Tenant Name',
    description: 'Tenant/environment display name.',
    type: 'string',
    category: 'client',
  },
  {
    key: 'signer_full_name',
    label: 'Signer Full Name',
    description: 'Recipient full name used for signature blocks.',
    type: 'string',
    category: 'signer',
  },
  {
    key: 'signer_email',
    label: 'Signer Email',
    description: 'Recipient email used in legal evidence.',
    type: 'string',
    category: 'signer',
  },
  {
    key: 'contract_title',
    label: 'Contract Title',
    description: 'Template display title.',
    type: 'string',
    category: 'contract',
  },
  {
    key: 'contract_version',
    label: 'Contract Version',
    description: 'Current template version number.',
    type: 'number',
    category: 'contract',
  },
  {
    key: 'current_date',
    label: 'Current Date',
    description: 'Execution date in ISO format.',
    type: 'date',
    category: 'contract',
  },
  {
    key: 'provider_legal_name',
    label: 'Provider Legal Name',
    description: 'Skuld legal entity name.',
    type: 'string',
    category: 'provider',
  },
];

@Injectable()
export class ContractTemplateService {
  private readonly storageProviderChain: string[];

  constructor(
    @InjectRepository(ContractTemplate)
    private readonly templateRepository: Repository<ContractTemplate>,
    @InjectRepository(ContractTemplateVersion)
    private readonly templateVersionRepository: Repository<ContractTemplateVersion>,
    private readonly pdfService: PdfService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly configService: ConfigService,
  ) {
    this.storageProviderChain = resolveProviderChain(
      this.configService.get<string>('STORAGE_PROVIDER_CHAIN'),
      this.configService.get<string>('STORAGE_PROVIDER'),
      ['s3', 'azure-blob'],
    );
  }

  async listTemplates(includeArchived = false): Promise<ContractTemplateResponseDto[]> {
    const templates = await this.templateRepository.find({
      relations: ['versions'],
      order: {
        updatedAt: 'DESC',
      },
    });

    return templates
      .filter((template) => includeArchived || template.status !== ContractTemplateStatus.ARCHIVED)
      .map((template) => this.toTemplateResponse(template));
  }

  async listTemplatesGrouped(
    includeArchived = false,
  ): Promise<ContractTemplateGroupedListResponseDto> {
    const templates = await this.templateRepository.find({
      relations: ['versions'],
      order: {
        updatedAt: 'DESC',
      },
    });

    const groups = templates
      .filter((template) => includeArchived || template.status !== ContractTemplateStatus.ARCHIVED)
      .map((template) => this.toGroupedResponse(template, includeArchived));

    return {
      templates: groups,
      total: groups.length,
    };
  }

  async getTemplateById(templateId: string): Promise<ContractTemplateResponseDto> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
      relations: ['versions'],
    });

    if (!template) {
      throw new NotFoundException({
        code: 'CONTRACT_TEMPLATE_NOT_FOUND',
        message: `Contract template ${templateId} was not found.`,
      });
    }

    return this.toTemplateResponse(template);
  }

  async getTemplateVariables(templateId: string): Promise<ContractTemplateVariablesResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    const version = this.resolveTemplateVersionForRead(template);
    const variables = this.toTemplateVariableItems(version.variableDefinitions ?? {});

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      versionId: version.id,
      variables,
    };
  }

  async getTemplateVariableCatalog(
    templateId: string,
  ): Promise<ContractTemplateVariableCatalogResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    const version = this.resolveTemplateVersionForRead(template);
    const templateVariables = this.toTemplateVariableItems(version.variableDefinitions ?? {});
    const categoriesMap = new Map<string, TemplateVariableCatalogCategoryDto>();

    const addItemToCategory = (category: string, label: string, item: TemplateVariableItemDto) => {
      const existing = categoriesMap.get(category);
      if (!existing) {
        categoriesMap.set(category, {
          category,
          label,
          variables: [item],
        });
        return;
      }
      existing.variables.push(item);
    };

    for (const item of templateVariables) {
      addItemToCategory('template', 'Template Variables', item);
    }

    for (const catalogItem of this.getSystemCatalogVariables()) {
      const categoryLabel = `${catalogItem.category[0].toUpperCase()}${catalogItem.category.slice(1)}`;
      addItemToCategory(catalogItem.category, categoryLabel, catalogItem);
    }

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      categories: Array.from(categoriesMap.values()).sort((a, b) =>
        a.category.localeCompare(b.category),
      ),
    };
  }

  async lintTemplate(templateId: string): Promise<ContractTemplateLintResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    const version = this.resolveTemplateVersionForRead(template);
    const issues: TemplateLintIssueDto[] = [];

    if (this.isDocumentJsonEmpty(version.documentJson)) {
      issues.push({
        code: 'TEMPLATE_EMPTY_DOCUMENT',
        severity: TemplateLintSeverity.ERROR,
        message: 'Template document is empty. Add at least one content block.',
        path: 'documentJson',
      });
    }

    const variableDefinitions = this.toTemplateVariableItems(version.variableDefinitions ?? {});
    if (variableDefinitions.length === 0) {
      issues.push({
        code: 'TEMPLATE_VARIABLES_EMPTY',
        severity: TemplateLintSeverity.WARNING,
        message: 'Template has no variable definitions configured.',
        path: 'variableDefinitions',
      });
    }

    const signatureFields = this.getTemplateSignatureFields(version);
    const templateVariableKeys = new Set(variableDefinitions.map((item) => item.key));
    const systemVariableKeys = new Set(this.getSystemCatalogVariables().map((item) => item.key));
    const hasUploadedPdf = Boolean(this.getTemplatePdfMetadata(version));
    if (signatureFields.length > 0 && !hasUploadedPdf) {
      issues.push({
        code: 'TEMPLATE_SIGNATURE_FIELDS_WITHOUT_PDF',
        severity: TemplateLintSeverity.WARNING,
        message: 'Signature fields are configured but no PDF has been uploaded yet.',
        path: 'metadata.signatureFields',
      });
    }

    signatureFields.forEach((field, index) => {
      if (!field.variableKey) {
        return;
      }
      const isKnownVariable =
        templateVariableKeys.has(field.variableKey) || systemVariableKeys.has(field.variableKey);
      if (!isKnownVariable) {
        issues.push({
          code: 'SIGNATURE_FIELD_UNKNOWN_VARIABLE',
          severity: TemplateLintSeverity.ERROR,
          message: `Signature field ${field.id} references unknown variable key ${field.variableKey}.`,
          path: `metadata.signatureFields[${index}].variableKey`,
        });
      }
    });

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      versionId: version.id,
      valid: !issues.some((item) => item.severity === TemplateLintSeverity.ERROR),
      issues,
    };
  }

  async resolveTemplateVariables(
    templateId: string,
    dto: ResolveTemplateVariablesDto,
  ): Promise<ResolveTemplateVariablesResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    const version = this.resolveTemplateVersionForRead(template);
    const definitions = this.toTemplateVariableItems(version.variableDefinitions ?? {});
    const inputs = dto.variables ?? {};
    const context = dto.context ?? {};
    const resolved: Record<string, unknown> = {};
    const missingRequired: string[] = [];
    const unresolved: string[] = [];

    for (const definition of definitions) {
      const providedInput = inputs[definition.key];
      const contextValue = context[definition.key];
      const value = this.firstDefinedValue(providedInput, contextValue, definition.defaultValue);

      if (value === undefined || value === null || value === '') {
        unresolved.push(definition.key);
        if (definition.required) {
          missingRequired.push(definition.key);
        }
        continue;
      }
      resolved[definition.key] = value;
    }

    const systemDefaults: Record<string, unknown> = {
      contract_title: template.title,
      contract_version: version.versionNumber,
      current_date: new Date().toISOString().slice(0, 10),
      provider_legal_name: 'Skuld, LLC',
    };

    for (const catalogVariable of this.getSystemCatalogVariables()) {
      if (resolved[catalogVariable.key] !== undefined) {
        continue;
      }
      const value = this.firstDefinedValue(
        inputs[catalogVariable.key],
        context[catalogVariable.key],
        systemDefaults[catalogVariable.key],
      );
      if (value !== undefined) {
        resolved[catalogVariable.key] = value;
      }
    }

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      versionId: version.id,
      resolved,
      missingRequired,
      unresolved,
    };
  }

  async uploadTemplatePdf(
    templateId: string,
    dto: UploadTemplatePdfDto,
    currentUser: User,
  ): Promise<ContractTemplatePdfPreviewResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    if (template.status === ContractTemplateStatus.ARCHIVED) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_ARCHIVED',
        message: `Template ${template.id} is archived and cannot be modified.`,
      });
    }

    const draft = await this.resolveOrCreateDraftVersion(template, currentUser.id);
    const contentType = dto.contentType?.trim().toLowerCase() || 'application/pdf';
    if (contentType !== 'application/pdf') {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_PDF_CONTENT_TYPE_INVALID',
        message: 'Only application/pdf content type is supported.',
      });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(dto.contentBase64, 'base64');
    } catch {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_PDF_INVALID_BASE64',
        message: 'Uploaded PDF content is not valid base64.',
      });
    }

    if (buffer.length === 0) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_PDF_EMPTY',
        message: 'Uploaded PDF file cannot be empty.',
      });
    }

    const maxUploadBytes = 15 * 1024 * 1024;
    if (buffer.length > maxUploadBytes) {
      throw new PayloadTooLargeException({
        code: 'CONTRACT_TEMPLATE_PDF_TOO_LARGE',
        message: `Uploaded PDF exceeds ${maxUploadBytes} bytes.`,
      });
    }

    const previousMetadata = this.getTemplatePdfMetadata(draft);
    const storageKey = this.buildTemplatePdfStorageKey(template.id, draft.versionNumber);
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    await this.providerFactory.executeWithFallback<StorageProvider, UploadResult>(
      IntegrationType.STORAGE,
      'upload',
      async (provider) =>
        provider.upload({
          key: storageKey,
          body: buffer,
          contentType,
          metadata: {
            templateId: template.id,
            templateVersionId: draft.id,
            templateKey: template.templateKey,
          },
        }),
      {
        providerChain: this.storageProviderChain,
      },
    );

    if (previousMetadata?.storageKey && previousMetadata.storageKey !== storageKey) {
      await this.providerFactory.executeWithFallback<StorageProvider, void>(
        IntegrationType.STORAGE,
        'delete',
        async (provider) => provider.delete(previousMetadata.storageKey),
        {
          providerChain: this.storageProviderChain,
        },
      );
    }

    draft.metadata = {
      ...(draft.metadata ?? {}),
      templatePdf: {
        storageKey,
        contentType,
        sha256,
        sizeBytes: buffer.length,
        uploadedAt: new Date().toISOString(),
      },
    };
    draft.updatedByUserId = currentUser.id;
    await this.templateVersionRepository.save(draft);

    return this.previewTemplatePdf(template.id);
  }

  async previewTemplatePdf(templateId: string): Promise<ContractTemplatePdfPreviewResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    const version = this.resolveTemplateVersionForRead(template);
    const metadata = this.getTemplatePdfMetadata(version);
    if (!metadata) {
      return {
        templateId: template.id,
        templateKey: template.templateKey,
        versionId: version.id,
        hasPdf: false,
        contentType: null,
        uploadedAt: null,
        signedUrl: null,
      };
    }

    const { result } = await this.providerFactory.executeWithFallback<StorageProvider, string>(
      IntegrationType.STORAGE,
      'getSignedUrl',
      async (provider) => provider.getSignedUrl(metadata.storageKey, 900),
      {
        providerChain: this.storageProviderChain,
      },
    );

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      versionId: version.id,
      hasPdf: true,
      contentType: metadata.contentType,
      uploadedAt: new Date(metadata.uploadedAt),
      signedUrl: result,
    };
  }

  async removeTemplatePdf(
    templateId: string,
    currentUser: User,
  ): Promise<ContractTemplatePdfPreviewResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    if (template.status === ContractTemplateStatus.ARCHIVED) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_ARCHIVED',
        message: `Template ${template.id} is archived and cannot be modified.`,
      });
    }

    const draft = await this.resolveOrCreateDraftVersion(template, currentUser.id);
    const metadata = this.getTemplatePdfMetadata(draft);

    if (metadata?.storageKey) {
      await this.providerFactory.executeWithFallback<StorageProvider, void>(
        IntegrationType.STORAGE,
        'delete',
        async (provider) => provider.delete(metadata.storageKey),
        {
          providerChain: this.storageProviderChain,
        },
      );
    }

    const nextMetadata = { ...(draft.metadata ?? {}) };
    delete nextMetadata['templatePdf'];
    draft.metadata = nextMetadata;
    draft.updatedByUserId = currentUser.id;
    await this.templateVersionRepository.save(draft);

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      versionId: draft.id,
      hasPdf: false,
      contentType: null,
      uploadedAt: null,
      signedUrl: null,
    };
  }

  async updateTemplateSignatureFields(
    templateId: string,
    dto: UpdateTemplateSignatureFieldsDto,
    currentUser: User,
  ): Promise<ContractTemplateSignatureFieldsResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    if (template.status === ContractTemplateStatus.ARCHIVED) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_ARCHIVED',
        message: `Template ${template.id} is archived and cannot be modified.`,
      });
    }

    const draft = await this.resolveOrCreateDraftVersion(template, currentUser.id);
    const fields = this.normalizeSignatureFields(dto.fields);
    draft.metadata = {
      ...(draft.metadata ?? {}),
      signatureFields: fields,
    };
    draft.updatedByUserId = currentUser.id;
    await this.templateVersionRepository.save(draft);

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      versionId: draft.id,
      fields,
    };
  }

  async createTemplate(
    dto: CreateContractTemplateDto,
    currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    const templateKey = dto.templateKey.trim().toLowerCase();
    const existing = await this.templateRepository.findOne({ where: { templateKey } });
    if (existing) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_KEY_EXISTS',
        message: `Contract template key ${templateKey} already exists.`,
      });
    }

    const template = this.templateRepository.create({
      templateKey,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      status: ContractTemplateStatus.DRAFT,
      activeVersionId: null,
      latestVersionNumber: 1,
      createdByUserId: currentUser.id,
      updatedByUserId: currentUser.id,
      metadata: {},
    });

    const savedTemplate = await this.templateRepository.save(template);

    const documentJson = dto.documentJson ?? {};
    const renderedHtml = this.pdfService.convertTipTapJsonToHtml(documentJson);

    await this.templateVersionRepository.save(
      this.templateVersionRepository.create({
        templateId: savedTemplate.id,
        versionNumber: 1,
        supersedesVersionId: null,
        status: ContractTemplateStatus.DRAFT,
        documentJson,
        variableDefinitions: this.normalizeVariableDefinitions(dto.variableDefinitions),
        renderedHtml,
        changeLog: dto.changeLog?.trim() || null,
        publishedAt: null,
        deprecatedAt: null,
        archivedAt: null,
        createdByUserId: currentUser.id,
        updatedByUserId: currentUser.id,
        metadata: {},
      }),
    );

    return this.getTemplateById(savedTemplate.id);
  }

  async updateTemplateDraft(
    templateId: string,
    dto: UpdateContractTemplateDraftDto,
    currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    const draft = await this.resolveOrCreateDraftVersion(template, currentUser.id);

    if (dto.title !== undefined) {
      template.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      template.description = dto.description.trim() || null;
    }

    if (dto.documentJson !== undefined) {
      draft.documentJson = dto.documentJson;
      draft.renderedHtml = this.pdfService.convertTipTapJsonToHtml(dto.documentJson);
    }

    if (dto.variableDefinitions !== undefined) {
      draft.variableDefinitions = this.normalizeVariableDefinitions(dto.variableDefinitions);
    }

    if (dto.changeLog !== undefined) {
      draft.changeLog = dto.changeLog.trim() || null;
    }

    draft.updatedByUserId = currentUser.id;
    template.updatedByUserId = currentUser.id;

    await this.templateVersionRepository.save(draft);
    await this.templateRepository.save(template);

    return this.getTemplateById(template.id);
  }

  async publishTemplate(
    templateId: string,
    dto: PublishContractTemplateDto,
    currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    const draft = await this.getLatestDraftVersion(template.id);

    if (!draft) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_DRAFT_REQUIRED',
        message: `Template ${template.id} has no draft version available for publish.`,
      });
    }

    if (this.isDocumentJsonEmpty(draft.documentJson)) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_DOCUMENT_REQUIRED',
        message: `Template ${template.id} draft version ${draft.versionNumber} has empty content.`,
      });
    }

    const now = new Date();
    const publishedVersions = template.versions.filter(
      (version) => version.status === ContractTemplateStatus.PUBLISHED,
    );

    for (const version of publishedVersions) {
      version.status = ContractTemplateStatus.DEPRECATED;
      version.deprecatedAt = now;
      version.updatedByUserId = currentUser.id;
      await this.templateVersionRepository.save(version);
    }

    draft.status = ContractTemplateStatus.PUBLISHED;
    draft.publishedAt = now;
    draft.deprecatedAt = null;
    draft.archivedAt = null;
    draft.updatedByUserId = currentUser.id;
    if (dto.changeLog !== undefined) {
      draft.changeLog = dto.changeLog.trim() || null;
    }

    await this.templateVersionRepository.save(draft);

    template.status = ContractTemplateStatus.PUBLISHED;
    template.activeVersionId = draft.id;
    template.latestVersionNumber = Math.max(template.latestVersionNumber, draft.versionNumber);
    template.updatedByUserId = currentUser.id;
    await this.templateRepository.save(template);

    return this.getTemplateById(template.id);
  }

  async deprecateTemplate(
    templateId: string,
    dto: DeprecateContractTemplateDto,
    currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);

    const activeVersion = template.activeVersionId
      ? (template.versions.find((version) => version.id === template.activeVersionId) ?? null)
      : null;

    if (activeVersion && activeVersion.status === ContractTemplateStatus.PUBLISHED) {
      activeVersion.status = ContractTemplateStatus.DEPRECATED;
      activeVersion.deprecatedAt = new Date();
      activeVersion.updatedByUserId = currentUser.id;
      if (dto.reason) {
        activeVersion.changeLog = dto.reason.trim();
      }
      await this.templateVersionRepository.save(activeVersion);
    }

    template.status = ContractTemplateStatus.DEPRECATED;
    template.activeVersionId = null;
    template.updatedByUserId = currentUser.id;
    template.metadata = {
      ...(template.metadata ?? {}),
      deprecatedReason: dto.reason?.trim() || null,
    };

    await this.templateRepository.save(template);

    return this.getTemplateById(template.id);
  }

  async createTemplateVersion(
    templateId: string,
    dto: CreateContractTemplateVersionDto,
    currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);
    const existingDraft = await this.getLatestDraftVersion(template.id);
    if (existingDraft) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_DRAFT_EXISTS',
        message: `Template ${template.id} already has draft version ${existingDraft.versionNumber}.`,
      });
    }

    const sourceVersion = template.activeVersionId
      ? (template.versions.find((version) => version.id === template.activeVersionId) ?? null)
      : null;

    const latestVersion =
      sourceVersion ??
      template.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] ??
      null;

    if (!latestVersion) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_VERSION_REQUIRED',
        message: `Template ${template.id} does not have a baseline version.`,
      });
    }

    const newVersionNumber = template.latestVersionNumber + 1;
    const nextDraft = this.templateVersionRepository.create({
      templateId: template.id,
      versionNumber: newVersionNumber,
      supersedesVersionId: latestVersion.id,
      status: ContractTemplateStatus.DRAFT,
      documentJson: latestVersion.documentJson ?? {},
      variableDefinitions: latestVersion.variableDefinitions ?? {},
      renderedHtml: latestVersion.renderedHtml,
      changeLog: dto.changeLog?.trim() || null,
      publishedAt: null,
      deprecatedAt: null,
      archivedAt: null,
      createdByUserId: currentUser.id,
      updatedByUserId: currentUser.id,
      metadata: {
        ...(latestVersion.metadata ?? {}),
        sourceVersionId: latestVersion.id,
      },
    });
    await this.templateVersionRepository.save(nextDraft);

    template.latestVersionNumber = newVersionNumber;
    template.updatedByUserId = currentUser.id;
    await this.templateRepository.save(template);

    return this.getTemplateById(template.id);
  }

  async archiveTemplate(
    templateId: string,
    currentUser: User,
  ): Promise<ContractTemplateResponseDto> {
    const template = await this.requireTemplateWithVersions(templateId);

    const activeVersion = template.activeVersionId
      ? (template.versions.find((version) => version.id === template.activeVersionId) ?? null)
      : null;

    if (activeVersion?.status === ContractTemplateStatus.PUBLISHED) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_ARCHIVE_REQUIRES_DEPRECATE',
        message: `Template ${template.id} must be deprecated before archive.`,
      });
    }

    const now = new Date();
    const versionsToArchive = template.versions.filter(
      (version) => version.status !== ContractTemplateStatus.ARCHIVED,
    );
    for (const version of versionsToArchive) {
      version.status = ContractTemplateStatus.ARCHIVED;
      version.archivedAt = now;
      version.updatedByUserId = currentUser.id;
    }
    await this.templateVersionRepository.save(versionsToArchive);

    template.status = ContractTemplateStatus.ARCHIVED;
    template.activeVersionId = null;
    template.updatedByUserId = currentUser.id;
    template.metadata = {
      ...(template.metadata ?? {}),
      archivedAt: now.toISOString(),
      archivedByUserId: currentUser.id,
    };
    await this.templateRepository.save(template);

    return this.getTemplateById(template.id);
  }

  async getTemplateVersionChainByTemplateKey(
    templateKey: string,
    includeArchived = false,
  ): Promise<ContractTemplateVersionChainResponseDto> {
    const normalizedTemplateKey = templateKey.trim().toLowerCase();
    const template = await this.templateRepository.findOne({
      where: { templateKey: normalizedTemplateKey },
      relations: ['versions'],
    });

    if (!template) {
      throw new NotFoundException({
        code: 'CONTRACT_TEMPLATE_NOT_FOUND',
        message: `Contract template with key ${templateKey} was not found.`,
      });
    }

    const versions = (template.versions ?? [])
      .filter((version) => includeArchived || version.status !== ContractTemplateStatus.ARCHIVED)
      .slice()
      .sort((a, b) => a.versionNumber - b.versionNumber);

    const versionById = new Map(versions.map((version) => [version.id, version]));
    const brokenNodeIds: string[] = [];
    let hasVersionGaps = false;
    let expectedVersionNumber = 1;

    for (const version of versions) {
      if (version.versionNumber !== expectedVersionNumber) {
        hasVersionGaps = true;
      }
      expectedVersionNumber = Math.max(expectedVersionNumber, version.versionNumber + 1);

      if (version.supersedesVersionId && !versionById.has(version.supersedesVersionId)) {
        brokenNodeIds.push(version.id);
      }
    }

    const chainNodes: ContractTemplateVersionChainNodeDto[] = versions
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        supersedesVersionId: version.supersedesVersionId,
        publishedAt: version.publishedAt,
        deprecatedAt: version.deprecatedAt,
        archivedAt: version.archivedAt,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
      }));

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      title: template.title,
      versions: chainNodes,
      integrity: {
        hasBrokenLinks: brokenNodeIds.length > 0,
        brokenNodeIds,
        hasVersionGaps,
        expectedNextVersion: expectedVersionNumber,
      },
    };
  }

  async getPublishedTemplateVersion(templateId: string): Promise<ContractTemplateVersion> {
    const template = await this.requireTemplateWithVersions(templateId);

    const active = template.activeVersionId
      ? (template.versions.find((version) => version.id === template.activeVersionId) ?? null)
      : null;

    const published =
      active && active.status === ContractTemplateStatus.PUBLISHED
        ? active
        : (template.versions
            .filter((version) => version.status === ContractTemplateStatus.PUBLISHED)
            .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null);

    if (!published) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_NOT_PUBLISHED',
        message: `Template ${templateId} does not have a published version.`,
      });
    }

    published.template = template;
    return published;
  }

  private async requireTemplateWithVersions(templateId: string): Promise<ContractTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
      relations: ['versions'],
    });

    if (!template) {
      throw new NotFoundException({
        code: 'CONTRACT_TEMPLATE_NOT_FOUND',
        message: `Contract template ${templateId} was not found.`,
      });
    }

    return template;
  }

  private async resolveOrCreateDraftVersion(
    template: ContractTemplate,
    userId: string,
  ): Promise<ContractTemplateVersion> {
    const existingDraft = await this.getLatestDraftVersion(template.id);
    if (existingDraft) {
      return existingDraft;
    }

    const source = template.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];

    if (!source) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_VERSION_REQUIRED',
        message: `Template ${template.id} does not have a baseline version.`,
      });
    }

    const nextVersion = this.templateVersionRepository.create({
      templateId: template.id,
      versionNumber: template.latestVersionNumber + 1,
      supersedesVersionId: source.id,
      status: ContractTemplateStatus.DRAFT,
      documentJson: source.documentJson ?? {},
      variableDefinitions: source.variableDefinitions ?? {},
      renderedHtml: source.renderedHtml,
      changeLog: source.changeLog,
      publishedAt: null,
      deprecatedAt: null,
      archivedAt: null,
      createdByUserId: userId,
      updatedByUserId: userId,
      metadata: {
        ...(source.metadata ?? {}),
      },
    });

    template.latestVersionNumber = nextVersion.versionNumber;
    template.updatedByUserId = userId;
    await this.templateRepository.save(template);

    return this.templateVersionRepository.save(nextVersion);
  }

  private async getLatestDraftVersion(templateId: string): Promise<ContractTemplateVersion | null> {
    return this.templateVersionRepository.findOne({
      where: {
        templateId,
        status: ContractTemplateStatus.DRAFT,
      },
      order: {
        versionNumber: 'DESC',
      },
    });
  }

  private toGroupedResponse(
    template: ContractTemplate,
    includeArchived: boolean,
  ): ContractTemplateGroupedResponseDto {
    const versions = (template.versions ?? [])
      .filter((version) => includeArchived || version.status !== ContractTemplateStatus.ARCHIVED)
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber);

    const latestVersion = versions[0] ?? null;
    const draftVersion =
      versions.find((version) => version.status === ContractTemplateStatus.DRAFT) ?? null;
    const activeVersion = template.activeVersionId
      ? (versions.find((version) => version.id === template.activeVersionId) ?? null)
      : null;

    return {
      id: template.id,
      templateKey: template.templateKey,
      title: template.title,
      description: template.description,
      status: template.status,
      totalVersions: versions.length,
      activeVersion: activeVersion ? this.toVersionSummary(activeVersion) : null,
      draftVersion: draftVersion ? this.toVersionSummary(draftVersion) : null,
      latestVersion: latestVersion ? this.toVersionSummary(latestVersion) : null,
      updatedAt: template.updatedAt,
    };
  }

  private toVersionSummary(version: ContractTemplateVersion) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      publishedAt: version.publishedAt,
      deprecatedAt: version.deprecatedAt,
      archivedAt: version.archivedAt,
      updatedAt: version.updatedAt,
    };
  }

  private isDocumentJsonEmpty(documentJson: Record<string, unknown> | null | undefined): boolean {
    if (!documentJson || Object.keys(documentJson).length === 0) {
      return true;
    }

    const maybeContent = (documentJson as { content?: unknown }).content;
    if (Array.isArray(maybeContent)) {
      return maybeContent.length === 0;
    }

    return false;
  }

  private resolveTemplateVersionForRead(template: ContractTemplate): ContractTemplateVersion {
    const versions = template.versions ?? [];
    const draft = versions
      .filter((version) => version.status === ContractTemplateStatus.DRAFT)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (draft) {
      return draft;
    }

    if (template.activeVersionId) {
      const active = versions.find((version) => version.id === template.activeVersionId);
      if (active) {
        return active;
      }
    }

    const latest = versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (!latest) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_VERSION_REQUIRED',
        message: `Template ${template.id} does not have versions.`,
      });
    }

    return latest;
  }

  private toTemplateVariableItems(
    definitions: Record<string, unknown> | null | undefined,
  ): TemplateVariableItemDto[] {
    if (!definitions || typeof definitions !== 'object') {
      return [];
    }

    return Object.entries(definitions)
      .map(([key, raw]) => {
        const value = (raw ?? {}) as Record<string, unknown>;
        return {
          key,
          label: (value['label'] as string | undefined) ?? null,
          description: (value['description'] as string | undefined) ?? null,
          type: (value['type'] as string | undefined) ?? null,
          required: Boolean(value['required']),
          defaultValue: value['defaultValue'],
          source: 'template' as const,
          category: 'template',
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  private getSystemCatalogVariables(): TemplateVariableItemDto[] {
    return TEMPLATE_VARIABLE_CATALOG.map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description,
      type: item.type,
      required: false,
      defaultValue: undefined,
      source: 'system' as const,
      category: item.category,
    }));
  }

  private getTemplatePdfMetadata(version: ContractTemplateVersion): TemplatePdfMetadata | null {
    const metadata = (version.metadata ?? {}) as Record<string, unknown>;
    const raw = metadata['templatePdf'];
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const obj = raw as Record<string, unknown>;
    if (typeof obj['storageKey'] !== 'string' || typeof obj['contentType'] !== 'string') {
      return null;
    }

    return {
      storageKey: obj['storageKey'],
      contentType: obj['contentType'],
      sha256: typeof obj['sha256'] === 'string' ? obj['sha256'] : '',
      sizeBytes: typeof obj['sizeBytes'] === 'number' ? obj['sizeBytes'] : 0,
      uploadedAt:
        typeof obj['uploadedAt'] === 'string' ? obj['uploadedAt'] : new Date(0).toISOString(),
    };
  }

  private getTemplateSignatureFields(
    version: ContractTemplateVersion,
  ): TemplateSignatureFieldDto[] {
    const metadata = (version.metadata ?? {}) as Record<string, unknown>;
    const raw = metadata['signatureFields'];
    if (!Array.isArray(raw)) {
      return [];
    }

    return this.normalizeSignatureFields(raw as TemplateSignatureFieldDto[]);
  }

  private normalizeSignatureFields(
    fields: TemplateSignatureFieldDto[],
  ): TemplateSignatureFieldDto[] {
    const seenIds = new Set<string>();
    const normalized: TemplateSignatureFieldDto[] = [];
    for (const field of fields) {
      const id = field.id.trim();
      if (!id) {
        continue;
      }
      if (seenIds.has(id)) {
        throw new BadRequestException({
          code: 'CONTRACT_TEMPLATE_SIGNATURE_FIELD_DUPLICATE',
          message: `Duplicate signature field id ${id}.`,
        });
      }
      seenIds.add(id);
      normalized.push({
        id,
        type: field.type,
        label: field.label?.trim(),
        variableKey: field.variableKey?.trim(),
        role: field.role?.trim(),
        placement: field.placement ?? {},
        required: field.required ?? true,
      });
    }
    return normalized;
  }

  private buildTemplatePdfStorageKey(templateId: string, versionNumber: number): string {
    return `contracts/templates/${templateId}/versions/${versionNumber}/template.pdf`;
  }

  private firstDefinedValue(...values: unknown[]): unknown {
    for (const value of values) {
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private normalizeVariableDefinitions(
    definitions: TemplateVariableDefinitionDto[] | undefined,
  ): Record<string, unknown> {
    if (!definitions) {
      return {};
    }

    const mapped: Record<string, unknown> = {};
    for (const definition of definitions) {
      const key = definition.key.trim();
      if (!key) {
        continue;
      }
      mapped[key] = {
        ...definition,
        key,
      };
    }

    return mapped;
  }

  private toTemplateResponse(template: ContractTemplate): ContractTemplateResponseDto {
    const versions = (template.versions ?? [])
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map((version) => this.toVersionResponse(version));

    return {
      id: template.id,
      templateKey: template.templateKey,
      title: template.title,
      description: template.description,
      status: template.status,
      activeVersionId: template.activeVersionId,
      latestVersionNumber: template.latestVersionNumber,
      metadata: template.metadata ?? {},
      versions,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private toVersionResponse(version: ContractTemplateVersion): ContractTemplateVersionResponseDto {
    return {
      id: version.id,
      templateId: version.templateId,
      versionNumber: version.versionNumber,
      status: version.status,
      documentJson: version.documentJson ?? {},
      variableDefinitions: version.variableDefinitions ?? {},
      renderedHtml: version.renderedHtml,
      changeLog: version.changeLog,
      supersedesVersionId: version.supersedesVersionId,
      publishedAt: version.publishedAt,
      deprecatedAt: version.deprecatedAt,
      archivedAt: version.archivedAt,
      metadata: version.metadata ?? {},
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    };
  }
}
