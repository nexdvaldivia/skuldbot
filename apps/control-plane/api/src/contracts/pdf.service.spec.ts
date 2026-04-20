import puppeteer from 'puppeteer';
import { ConfigService } from '@nestjs/config';
import { IntegrationType } from '../common/interfaces/integration.interface';
import { ProviderFactoryService } from '../integrations/provider-factory.service';
import { Contract } from './entities/contract.entity';
import { PdfService } from './pdf.service';

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: jest.fn(),
  },
}));

describe('PdfService', () => {
  const mockedPuppeteer = puppeteer as unknown as {
    launch: jest.Mock;
  };

  it('converts TipTap JSON into HTML blocks', () => {
    const providerFactory = {
      executeWithFallback: jest.fn(),
    } as unknown as ProviderFactoryService;
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_PROVIDER_CHAIN') return 's3,azure-blob';
        if (key === 'STORAGE_PROVIDER') return 's3';
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new PdfService(providerFactory, configService);

    const html = service.convertTipTapJsonToHtml({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'MSA' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Term ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'one' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }],
            },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [{ type: 'tableHeader', content: [{ type: 'text', text: 'A' }] }],
            },
          ],
        },
      ],
    });

    expect(html).toContain('<h1>MSA</h1>');
    expect(html).toContain('<p><strong>Term </strong>one</p>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<table>');
  });

  it('generates PDF and uploads through storage provider fallback', async () => {
    const mockPdf = Buffer.from('pdf-content');
    const mockPage = {
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(mockPdf),
    };
    const mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockedPuppeteer.launch.mockResolvedValue(mockBrowser);

    const providerFactory = {
      executeWithFallback: jest
        .fn()
        .mockResolvedValue({
          provider: 's3',
          attemptedProviders: ['s3'],
          result: { key: 'contracts/client-1/ctr-1/contract-v1.pdf', url: 'https://x' },
        }),
    } as unknown as ProviderFactoryService;

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_PROVIDER_CHAIN') return 's3,azure-blob';
        if (key === 'STORAGE_PROVIDER') return 's3';
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new PdfService(providerFactory, configService);

    const contract = {
      id: 'ctr-1',
      clientId: 'client-1',
      tenantId: 'tenant-1',
      title: 'Master Service Agreement',
      version: 1,
      documentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      },
    } as unknown as Contract;

    const result = await service.generateAndStoreContractPdf(contract);

    expect(result.pdfPath).toBe('contracts/client-1/ctr-1/contract-v1.pdf');
    expect(result.renderedHtml).toContain('<!doctype html>');
    expect(mockedPuppeteer.launch).toHaveBeenCalledTimes(1);
    expect(providerFactory.executeWithFallback).toHaveBeenCalledWith(
      IntegrationType.STORAGE,
      'upload',
      expect.any(Function),
      expect.objectContaining({
        tenantId: 'tenant-1',
        providerChain: ['s3', 'azure-blob'],
      }),
    );
  });

  it('downloads existing PDF through provider fallback', async () => {
    const providerFactory = {
      executeWithFallback: jest
        .fn()
        .mockResolvedValue({
          provider: 's3',
          attemptedProviders: ['s3'],
          result: Buffer.from('pdf'),
        }),
    } as unknown as ProviderFactoryService;
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_PROVIDER_CHAIN') return 's3';
        if (key === 'STORAGE_PROVIDER') return 's3';
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new PdfService(providerFactory, configService);

    const contract = {
      id: 'ctr-1',
      clientId: 'client-1',
      tenantId: null,
      pdfPath: 'contracts/client-1/ctr-1/contract-v1.pdf',
    } as unknown as Contract;

    const buffer = await service.downloadContractPdf(contract);
    expect(buffer.toString()).toBe('pdf');
    expect(providerFactory.executeWithFallback).toHaveBeenCalledWith(
      IntegrationType.STORAGE,
      'download',
      expect.any(Function),
      expect.objectContaining({
        tenantId: undefined,
      }),
    );
  });

  it('rejects download when contract has no PDF path', async () => {
    const providerFactory = {
      executeWithFallback: jest.fn(),
    } as unknown as ProviderFactoryService;
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_PROVIDER_CHAIN') return 's3';
        if (key === 'STORAGE_PROVIDER') return 's3';
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new PdfService(providerFactory, configService);

    await expect(
      service.downloadContractPdf({
        id: 'ctr-1',
        clientId: 'client-1',
        tenantId: null,
        pdfPath: null,
      } as unknown as Contract),
    ).rejects.toThrow('Contract PDF path is not set');
  });
});
