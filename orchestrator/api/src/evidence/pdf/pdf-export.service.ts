import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Attestation data structure for PDF generation
 */
export interface AttestationData {
  attestationId: string;
  framework: string;
  frameworkDisplayName: string;
  organizationId: string;
  organizationName: string;
  botId: string;
  botName: string;
  generatedAt: string;
  generatedBy: string;

  summary: {
    overallStatus: string;
    complianceScore: number;
    totalControls: number;
    passedControls: number;
    failedControls: number;
    partialControls: number;
    notApplicable: number;
    requiresReview: number;
  };

  executiveSummary: string;

  controlsByCategory: Array<{
    category: string;
    controls: Array<{
      controlId: string;
      name: string;
      status: string;
      findings: string;
      recommendations: string;
      evidenceReferences: string[];
    }>;
  }>;

  evidenceReferences: Array<{
    packId: string;
    executionId: string;
    botName: string;
    createdAt: string;
    merkleRoot: string;
    signatureValid: boolean;
  }>;

  recommendations: string[];

  signature?: {
    signedAt: string;
    algorithm: string;
    certificateFingerprint: string;
  };
}

/**
 * PDF Export Service
 *
 * Generates PDF attestation reports for auditors.
 * Uses PDFKit for PDF generation with professional formatting.
 */
@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate PDF attestation report.
   */
  async generateAttestationPdf(data: AttestationData): Promise<Buffer> {
    // For now, return HTML that can be converted to PDF
    // In production, use puppeteer or pdfkit
    const html = this.generateAttestationHtml(data);

    // Convert HTML to PDF (requires puppeteer in production)
    return this.htmlToPdf(html);
  }

  /**
   * Generate HTML attestation report (can be printed to PDF).
   */
  generateAttestationHtml(data: AttestationData): string {
    const statusColors: Record<string, string> = {
      compliant: '#22c55e',
      partially_compliant: '#eab308',
      non_compliant: '#ef4444',
      pending_review: '#3b82f6',
    };

    const statusColor = statusColors[data.summary.overallStatus] || '#6b7280';

    const controlRows = data.controlsByCategory
      .flatMap((category) =>
        category.controls.map((control) => {
          const statusClass = {
            passed: 'status-passed',
            failed: 'status-failed',
            partially_met: 'status-partial',
            requires_manual_review: 'status-review',
            not_applicable: 'status-na',
          }[control.status] || '';

          return `
            <tr class="${statusClass}">
              <td>${control.controlId}</td>
              <td>${control.name}</td>
              <td>${category.category}</td>
              <td>${control.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</td>
              <td>${control.findings}</td>
            </tr>
          `;
        }),
      )
      .join('');

    const evidenceRows = data.evidenceReferences
      .map(
        (ref) => `
        <tr>
          <td>${ref.packId}</td>
          <td>${ref.botName}</td>
          <td>${new Date(ref.createdAt).toLocaleDateString()}</td>
          <td><code>${ref.merkleRoot.substring(0, 16)}...</code></td>
          <td>${ref.signatureValid ? '✓ Valid' : '✗ Invalid'}</td>
        </tr>
      `,
      )
      .join('');

    const recommendationsList = data.recommendations
      .map((r) => `<li>${r}</li>`)
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compliance Attestation Report - ${data.attestationId}</title>
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1f2937;
      margin: 0;
      padding: 20px;
    }

    .header {
      border-bottom: 3px solid ${statusColor};
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .logo {
      font-size: 24pt;
      font-weight: bold;
      color: #111827;
    }

    .report-title {
      font-size: 18pt;
      color: #374151;
      margin-top: 10px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin: 20px 0;
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 9pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .meta-value {
      font-size: 12pt;
      font-weight: 500;
      color: #111827;
    }

    .score-section {
      display: flex;
      justify-content: space-around;
      align-items: center;
      background: #f9fafb;
      padding: 30px;
      border-radius: 8px;
      margin: 30px 0;
      page-break-inside: avoid;
    }

    .score-card {
      text-align: center;
    }

    .score-value {
      font-size: 36pt;
      font-weight: bold;
      color: ${statusColor};
    }

    .score-label {
      font-size: 10pt;
      color: #6b7280;
      margin-top: 5px;
    }

    .status-badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      background: ${statusColor};
      color: white;
      font-weight: 600;
      font-size: 11pt;
      text-transform: uppercase;
    }

    h2 {
      font-size: 14pt;
      color: #111827;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
      margin-top: 40px;
      page-break-after: avoid;
    }

    .executive-summary {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid ${statusColor};
      white-space: pre-line;
      page-break-inside: avoid;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 10pt;
    }

    th {
      background: #1f2937;
      color: white;
      padding: 12px 8px;
      text-align: left;
      font-weight: 600;
    }

    td {
      padding: 10px 8px;
      border-bottom: 1px solid #e5e7eb;
    }

    tr:nth-child(even) {
      background: #f9fafb;
    }

    .status-passed { background: #f0fdf4 !important; }
    .status-failed { background: #fef2f2 !important; }
    .status-partial { background: #fefce8 !important; }
    .status-review { background: #eff6ff !important; }
    .status-na { background: #f9fafb !important; color: #9ca3af; }

    .recommendations {
      background: #fefce8;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #eab308;
    }

    .recommendations ul {
      margin: 10px 0;
      padding-left: 20px;
    }

    .recommendations li {
      margin: 8px 0;
    }

    .signature-section {
      margin-top: 40px;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
      page-break-inside: avoid;
    }

    .signature-line {
      border-top: 1px solid #374151;
      width: 300px;
      margin-top: 60px;
      padding-top: 10px;
    }

    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 9pt;
      color: #6b7280;
      text-align: center;
    }

    code {
      background: #e5e7eb;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 9pt;
    }

    .watermark {
      position: fixed;
      bottom: 10px;
      right: 10px;
      font-size: 8pt;
      color: #d1d5db;
    }

    @media print {
      body {
        padding: 0;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">SkuldBot</div>
    <div class="report-title">Compliance Attestation Report</div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <span class="meta-label">Attestation ID</span>
      <span class="meta-value">${data.attestationId}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Framework</span>
      <span class="meta-value">${data.frameworkDisplayName}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Organization</span>
      <span class="meta-value">${data.organizationName}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Bot</span>
      <span class="meta-value">${data.botName}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Generated</span>
      <span class="meta-value">${new Date(data.generatedAt).toLocaleString()}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Generated By</span>
      <span class="meta-value">${data.generatedBy}</span>
    </div>
  </div>

  <div class="score-section">
    <div class="score-card">
      <div class="score-value">${data.summary.complianceScore}%</div>
      <div class="score-label">Compliance Score</div>
    </div>
    <div class="score-card">
      <div class="score-value">${data.summary.passedControls}/${data.summary.totalControls}</div>
      <div class="score-label">Controls Passed</div>
    </div>
    <div class="score-card">
      <span class="status-badge">${data.summary.overallStatus.replace(/_/g, ' ')}</span>
      <div class="score-label" style="margin-top: 10px;">Overall Status</div>
    </div>
  </div>

  <h2>Executive Summary</h2>
  <div class="executive-summary">${data.executiveSummary}</div>

  <h2>Control Evaluations</h2>
  <table>
    <thead>
      <tr>
        <th>Control ID</th>
        <th>Name</th>
        <th>Category</th>
        <th>Status</th>
        <th>Findings</th>
      </tr>
    </thead>
    <tbody>
      ${controlRows}
    </tbody>
  </table>

  ${
    data.recommendations.length > 0
      ? `
  <h2>Recommendations</h2>
  <div class="recommendations">
    <ul>${recommendationsList}</ul>
  </div>
  `
      : ''
  }

  <h2>Evidence Pack References</h2>
  <table>
    <thead>
      <tr>
        <th>Pack ID</th>
        <th>Bot</th>
        <th>Created</th>
        <th>Merkle Root</th>
        <th>Signature</th>
      </tr>
    </thead>
    <tbody>
      ${evidenceRows}
    </tbody>
  </table>

  ${
    data.signature
      ? `
  <div class="signature-section">
    <h3>Digital Signature</h3>
    <p><strong>Algorithm:</strong> ${data.signature.algorithm}</p>
    <p><strong>Signed At:</strong> ${new Date(data.signature.signedAt).toLocaleString()}</p>
    <p><strong>Certificate:</strong> <code>${data.signature.certificateFingerprint}</code></p>
    <div class="signature-line">
      Authorized Signature
    </div>
  </div>
  `
      : ''
  }

  <div class="footer">
    <p>This report was automatically generated by SkuldBot Compliance Engine.</p>
    <p>Report ID: ${data.attestationId} | Generated: ${new Date(data.generatedAt).toISOString()}</p>
    <p>For verification, contact your organization's compliance administrator.</p>
  </div>

  <div class="watermark">
    Generated by SkuldBot
  </div>
</body>
</html>`;
  }

  /**
   * Convert HTML to PDF buffer.
   * In production, use puppeteer for accurate rendering.
   */
  private async htmlToPdf(html: string): Promise<Buffer> {
    // For now, return HTML as buffer
    // In production:
    // const browser = await puppeteer.launch();
    // const page = await browser.newPage();
    // await page.setContent(html);
    // const pdf = await page.pdf({ format: 'A4' });
    // await browser.close();
    // return pdf;

    // Placeholder: return HTML as buffer (client can print to PDF)
    return Buffer.from(html, 'utf-8');
  }

  /**
   * Generate a summary PDF with multiple attestations.
   */
  async generateSummaryPdf(
    organizationName: string,
    attestations: AttestationData[],
  ): Promise<Buffer> {
    const frameworkSummary = attestations.map((a) => ({
      framework: a.frameworkDisplayName,
      score: a.summary.complianceScore,
      status: a.summary.overallStatus,
      date: a.generatedAt,
    }));

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compliance Summary - ${organizationName}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      padding: 40px;
      color: #1f2937;
    }
    h1 {
      color: #111827;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 30px;
    }
    th {
      background: #1f2937;
      color: white;
      padding: 15px;
      text-align: left;
    }
    td {
      padding: 15px;
      border-bottom: 1px solid #e5e7eb;
    }
    .score {
      font-size: 18pt;
      font-weight: bold;
    }
    .compliant { color: #22c55e; }
    .partial { color: #eab308; }
    .non-compliant { color: #ef4444; }
  </style>
</head>
<body>
  <h1>Compliance Summary Report</h1>
  <h2>${organizationName}</h2>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <table>
    <thead>
      <tr>
        <th>Framework</th>
        <th>Score</th>
        <th>Status</th>
        <th>Last Evaluated</th>
      </tr>
    </thead>
    <tbody>
      ${frameworkSummary
        .map(
          (f) => `
        <tr>
          <td>${f.framework}</td>
          <td class="score ${f.score >= 90 ? 'compliant' : f.score >= 70 ? 'partial' : 'non-compliant'}">${f.score}%</td>
          <td>${f.status.replace(/_/g, ' ')}</td>
          <td>${new Date(f.date).toLocaleDateString()}</td>
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>

  <div style="margin-top: 50px; font-size: 10pt; color: #6b7280;">
    Generated by SkuldBot Compliance Engine
  </div>
</body>
</html>`;

    return this.htmlToPdf(html);
  }
}
