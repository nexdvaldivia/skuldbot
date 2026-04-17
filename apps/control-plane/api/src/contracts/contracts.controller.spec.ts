import { StreamableFile } from '@nestjs/common';
import { ContractLegalService } from './contract-legal.service';
import { ContractLookupsService } from './contract-lookups.service';
import { ContractRequirementService } from './contract-requirement.service';
import { ContractSignatoryPolicyService } from './contract-signatory-policy.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractTemplateService } from './contract-template.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

describe('ContractsController', () => {
  it('delegates PDF generation to service', async () => {
    const contractsService = {
      generatePdf: jest.fn().mockResolvedValue({ id: 'ctr-1', pdfPath: 'contracts/x.pdf' }),
    } as unknown as ContractsService;

    const controller = new ContractsController(
      contractsService,
      {} as ContractTemplateService,
      {} as ContractSigningService,
      {} as ContractLookupsService,
      {} as ContractRequirementService,
      {} as ContractLegalService,
      {} as ContractSignatoryPolicyService,
    );
    const currentUser = { id: 'user-1' } as any;

    const result = await controller.generatePdf('ctr-1', currentUser);
    expect(result).toEqual({ id: 'ctr-1', pdfPath: 'contracts/x.pdf' });
    expect(contractsService.generatePdf).toHaveBeenCalledWith('ctr-1', currentUser);
  });

  it('returns streamable file and response headers for PDF download', async () => {
    const contractsService = {
      downloadPdf: jest.fn().mockResolvedValue({
        fileName: 'msa.pdf',
        buffer: Buffer.from('pdf-content'),
      }),
    } as unknown as ContractsService;

    const controller = new ContractsController(
      contractsService,
      {} as ContractTemplateService,
      {} as ContractSigningService,
      {} as ContractLookupsService,
      {} as ContractRequirementService,
      {} as ContractLegalService,
      {} as ContractSignatoryPolicyService,
    );
    const response = {
      setHeader: jest.fn(),
    } as any;
    const currentUser = { id: 'user-1' } as any;

    const result = await controller.downloadPdf('ctr-1', currentUser, response);
    expect(result).toBeInstanceOf(StreamableFile);
    expect(contractsService.downloadPdf).toHaveBeenCalledWith('ctr-1', currentUser);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="msa.pdf"',
    );
  });

  it('delegates grouped template list to template service', async () => {
    const contractTemplateService = {
      listTemplatesGrouped: jest.fn().mockResolvedValue({
        templates: [{ id: 'tpl-1', templateKey: 'msa.v1' }],
        total: 1,
      }),
    } as unknown as ContractTemplateService;

    const controller = new ContractsController(
      {} as ContractsService,
      contractTemplateService,
      {} as ContractSigningService,
      {} as ContractLookupsService,
      {} as ContractRequirementService,
      {} as ContractLegalService,
      {} as ContractSignatoryPolicyService,
    );

    const result = await controller.listTemplatesGrouped({ includeArchived: true });

    expect(contractTemplateService.listTemplatesGrouped).toHaveBeenCalledWith(true);
    expect(result.total).toBe(1);
  });

  it('delegates template version chain to template service', async () => {
    const contractTemplateService = {
      getTemplateVersionChainByTemplateKey: jest.fn().mockResolvedValue({
        templateId: 'tpl-1',
        templateKey: 'msa.v1',
        title: 'Master Service Agreement',
        versions: [],
        integrity: {
          hasBrokenLinks: false,
          brokenNodeIds: [],
          hasVersionGaps: false,
          expectedNextVersion: 2,
        },
      }),
    } as unknown as ContractTemplateService;

    const controller = new ContractsController(
      {} as ContractsService,
      contractTemplateService,
      {} as ContractSigningService,
      {} as ContractLookupsService,
      {} as ContractRequirementService,
      {} as ContractLegalService,
      {} as ContractSignatoryPolicyService,
    );

    const result = await controller.getTemplateVersionChain('MSA.V1', { includeArchived: false });

    expect(contractTemplateService.getTemplateVersionChainByTemplateKey).toHaveBeenCalledWith(
      'MSA.V1',
      false,
    );
    expect(result.templateId).toBe('tpl-1');
  });

  it('delegates template variables catalog to template service', async () => {
    const contractTemplateService = {
      getTemplateVariableCatalog: jest.fn().mockResolvedValue({
        templateId: 'tpl-1',
        templateKey: 'msa.v1',
        categories: [],
      }),
    } as unknown as ContractTemplateService;

    const controller = new ContractsController(
      {} as ContractsService,
      contractTemplateService,
      {} as ContractSigningService,
      {} as ContractLookupsService,
      {} as ContractRequirementService,
      {} as ContractLegalService,
      {} as ContractSignatoryPolicyService,
    );

    const result = await controller.getTemplateVariableCatalog('tpl-1');
    expect(contractTemplateService.getTemplateVariableCatalog).toHaveBeenCalledWith('tpl-1');
    expect(result.templateId).toBe('tpl-1');
  });

  it('delegates template PDF upload to template service', async () => {
    const contractTemplateService = {
      uploadTemplatePdf: jest.fn().mockResolvedValue({
        templateId: 'tpl-1',
        templateKey: 'msa.v1',
        versionId: 'tv-1',
        hasPdf: true,
        contentType: 'application/pdf',
        uploadedAt: new Date('2026-04-17T00:00:00.000Z'),
        signedUrl: 'https://signed.example/template.pdf',
      }),
    } as unknown as ContractTemplateService;

    const controller = new ContractsController(
      {} as ContractsService,
      contractTemplateService,
      {} as ContractSigningService,
      {} as ContractLookupsService,
      {} as ContractRequirementService,
      {} as ContractLegalService,
      {} as ContractSignatoryPolicyService,
    );

    const currentUser = { id: 'user-1' } as any;
    const payload = { contentBase64: Buffer.from('%PDF-1.4').toString('base64') };
    const result = await controller.uploadTemplatePdf('tpl-1', payload as any, currentUser);

    expect(contractTemplateService.uploadTemplatePdf).toHaveBeenCalledWith(
      'tpl-1',
      payload,
      currentUser,
    );
    expect(result.hasPdf).toBe(true);
  });

  it('delegates signature fields update to template service', async () => {
    const contractTemplateService = {
      updateTemplateSignatureFields: jest.fn().mockResolvedValue({
        templateId: 'tpl-1',
        templateKey: 'msa.v1',
        versionId: 'tv-2',
        fields: [{ id: 'sig-1', type: 'signature' }],
      }),
    } as unknown as ContractTemplateService;

    const controller = new ContractsController(
      {} as ContractsService,
      contractTemplateService,
      {} as ContractSigningService,
      {} as ContractLookupsService,
      {} as ContractRequirementService,
      {} as ContractLegalService,
      {} as ContractSignatoryPolicyService,
    );

    const currentUser = { id: 'user-1' } as any;
    const dto = { fields: [{ id: 'sig-1', type: 'signature' }] };
    const result = await controller.updateTemplateSignatureFields('tpl-1', dto as any, currentUser);

    expect(contractTemplateService.updateTemplateSignatureFields).toHaveBeenCalledWith(
      'tpl-1',
      dto,
      currentUser,
    );
    expect(result.versionId).toBe('tv-2');
  });
});
