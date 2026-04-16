import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  ContractTemplateResponseDto,
  ContractTemplateVersionResponseDto,
  CreateContractTemplateDto,
  DeprecateContractTemplateDto,
  PublishContractTemplateDto,
  TemplateVariableDefinitionDto,
  UpdateContractTemplateDraftDto,
} from './dto/template.dto';
import { ContractTemplateStatus } from './entities/contract-domain.enums';
import { ContractTemplate } from './entities/contract-template.entity';
import { ContractTemplateVersion } from './entities/contract-template-version.entity';
import { PdfService } from './pdf.service';

@Injectable()
export class ContractTemplateService {
  constructor(
    @InjectRepository(ContractTemplate)
    private readonly templateRepository: Repository<ContractTemplate>,
    @InjectRepository(ContractTemplateVersion)
    private readonly templateVersionRepository: Repository<ContractTemplateVersion>,
    private readonly pdfService: PdfService,
  ) {}

  async listTemplates(): Promise<ContractTemplateResponseDto[]> {
    const templates = await this.templateRepository.find({
      relations: ['versions'],
      order: {
        updatedAt: 'DESC',
      },
    });

    return templates.map((template) => this.toTemplateResponse(template));
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
