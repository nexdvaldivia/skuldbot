import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer from 'puppeteer';
import {
  IntegrationType,
  StorageProvider,
  UploadResult,
} from '../common/interfaces/integration.interface';
import { ProviderFactoryService } from '../integrations/provider-factory.service';
import { resolveProviderChain } from '../integrations/provider-chain.util';
import { Contract } from './entities/contract.entity';

type TipTapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: TipTapNode[];
};

@Injectable()
export class PdfService {
  private readonly providerChain: string[];

  constructor(
    private readonly providerFactory: ProviderFactoryService,
    private readonly configService: ConfigService,
  ) {
    this.providerChain = resolveProviderChain(
      this.configService.get<string>('STORAGE_PROVIDER_CHAIN'),
      this.configService.get<string>('STORAGE_PROVIDER'),
      ['s3', 'azure-blob'],
    );
  }

  convertTipTapJsonToHtml(documentJson: unknown): string {
    if (!documentJson || typeof documentJson !== 'object') {
      return '<p></p>';
    }

    const root = documentJson as TipTapNode;
    if (root.type !== 'doc') {
      return this.renderNode(root) || '<p></p>';
    }

    const content = root.content ?? [];
    if (content.length === 0) {
      return '<p></p>';
    }

    const rendered = content.map((node) => this.renderNode(node)).join('');
    return rendered.trim().length > 0 ? rendered : '<p></p>';
  }

  async generateAndStoreContractPdf(
    contract: Contract,
  ): Promise<{ renderedHtml: string; pdfPath: string }> {
    const htmlBody = this.convertTipTapJsonToHtml(contract.documentJson);
    const renderedHtml = this.wrapHtmlDocument(contract.title, htmlBody);
    const pdfBuffer = await this.renderPdf(renderedHtml);

    const key = this.buildPdfStorageKey(contract);

    const { result } = await this.providerFactory.executeWithFallback<
      StorageProvider,
      UploadResult
    >(
      IntegrationType.STORAGE,
      'upload',
      async (provider) =>
        provider.upload({
          key,
          body: pdfBuffer,
          contentType: 'application/pdf',
          metadata: {
            contractId: contract.id,
            clientId: contract.clientId,
            tenantId: contract.tenantId ?? '',
          },
        }),
      {
        tenantId: contract.tenantId ?? undefined,
        providerChain: this.providerChain,
      },
    );

    return {
      renderedHtml,
      pdfPath: result.key,
    };
  }

  async downloadContractPdf(contract: Contract): Promise<Buffer> {
    if (!contract.pdfPath) {
      throw new Error('Contract PDF path is not set');
    }

    const { result } = await this.providerFactory.executeWithFallback<StorageProvider, Buffer>(
      IntegrationType.STORAGE,
      'download',
      async (provider) => provider.download(contract.pdfPath as string),
      {
        tenantId: contract.tenantId ?? undefined,
        providerChain: this.providerChain,
      },
    );

    return result;
  }

  private async renderPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '16mm',
          bottom: '20mm',
          left: '16mm',
        },
      });

      return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private wrapHtmlDocument(title: string, htmlBody: string): string {
    const escapedTitle = this.escapeHtml(title || 'Contract');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 12px;
        line-height: 1.6;
        color: #111827;
      }
      h1, h2, h3, h4, h5, h6 {
        margin: 18px 0 8px;
        line-height: 1.3;
      }
      p {
        margin: 10px 0;
      }
      ul, ol {
        margin: 10px 0 10px 24px;
      }
      blockquote {
        margin: 12px 0;
        padding-left: 12px;
        border-left: 3px solid #d1d5db;
        color: #374151;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 14px 0;
      }
      td, th {
        border: 1px solid #d1d5db;
        padding: 8px;
        vertical-align: top;
      }
      pre {
        background: #f3f4f6;
        padding: 10px;
        border-radius: 6px;
        overflow-x: auto;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      }
    </style>
  </head>
  <body>
    ${htmlBody}
  </body>
</html>`;
  }

  private buildPdfStorageKey(contract: Contract): string {
    const safeVersion = Number.isFinite(contract.version) ? contract.version : 1;
    return `contracts/${contract.clientId}/${contract.id}/contract-v${safeVersion}.pdf`;
  }

  private renderNode(node: TipTapNode | null | undefined): string {
    if (!node) {
      return '';
    }

    const type = node.type ?? 'text';

    if (type === 'text') {
      return this.renderTextNode(node);
    }

    const children = (node.content ?? []).map((child) => this.renderNode(child)).join('');

    switch (type) {
      case 'doc':
        return children;
      case 'paragraph':
        return `<p>${children || '<br />'}</p>`;
      case 'heading': {
        const level = this.normalizeHeadingLevel(node.attrs?.['level']);
        return `<h${level}>${children}</h${level}>`;
      }
      case 'bulletList':
        return `<ul>${children}</ul>`;
      case 'orderedList':
        return `<ol>${children}</ol>`;
      case 'listItem':
        return `<li>${children}</li>`;
      case 'blockquote':
        return `<blockquote>${children}</blockquote>`;
      case 'hardBreak':
        return '<br />';
      case 'codeBlock': {
        const language = this.escapeHtml(String(node.attrs?.['language'] || ''));
        const codeClass = language ? ` class="language-${language}"` : '';
        return `<pre><code${codeClass}>${children}</code></pre>`;
      }
      case 'table':
        return `<table><tbody>${children}</tbody></table>`;
      case 'tableRow':
        return `<tr>${children}</tr>`;
      case 'tableCell':
        return `<td>${children}</td>`;
      case 'tableHeader':
        return `<th>${children}</th>`;
      default:
        return children;
    }
  }

  private renderTextNode(node: TipTapNode): string {
    let output = this.escapeHtml(node.text ?? '');

    for (const mark of node.marks ?? []) {
      const markType = mark.type ?? '';
      switch (markType) {
        case 'bold':
        case 'strong':
          output = `<strong>${output}</strong>`;
          break;
        case 'italic':
        case 'em':
          output = `<em>${output}</em>`;
          break;
        case 'underline':
          output = `<u>${output}</u>`;
          break;
        case 'strike':
          output = `<s>${output}</s>`;
          break;
        case 'code':
          output = `<code>${output}</code>`;
          break;
        case 'link': {
          const href = this.escapeHtml(String(mark.attrs?.['href'] || ''));
          output = `<a href="${href}" target="_blank" rel="noreferrer noopener">${output}</a>`;
          break;
        }
        default:
          break;
      }
    }

    return output;
  }

  private normalizeHeadingLevel(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 2;
    }

    return Math.min(6, Math.max(1, Math.floor(parsed)));
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
