import { StreamableFile } from '@nestjs/common';
import { ContractLegalService } from './contract-legal.service';
import { ContractLookupsService } from './contract-lookups.service';
import { ContractRequirementService } from './contract-requirement.service';
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
});
