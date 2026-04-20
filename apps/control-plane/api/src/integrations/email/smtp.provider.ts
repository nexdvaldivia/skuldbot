import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  EmailProvider,
  IntegrationType,
  SendEmailData,
  SendTemplateEmailData,
  SendEmailResult,
} from '../../common/interfaces/integration.interface';

@Injectable()
export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';
  readonly type = IntegrationType.EMAIL;

  private readonly logger = new Logger(SmtpProvider.name);
  private transporter: nodemailer.Transporter | null = null;
  private defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.defaultFrom = this.configService.get<string>('EMAIL_FROM', 'noreply@skuldbot.com');

    if (host && port) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      this.logger.log('SMTP provider initialized');
    } else {
      this.logger.warn('SMTP provider not configured - SMTP_HOST or SMTP_PORT missing');
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  async send(data: SendEmailData): Promise<SendEmailResult> {
    this.ensureConfigured();

    const mailOptions: nodemailer.SendMailOptions = {
      from: data.from || this.defaultFrom,
      to: Array.isArray(data.to) ? data.to.join(', ') : data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
      cc: data.cc?.join(', '),
      bcc: data.bcc?.join(', '),
      replyTo: data.replyTo,
      attachments: data.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    };

    try {
      const info = await this.transporter!.sendMail(mailOptions);
      return {
        messageId: info.messageId,
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to send email', error);
      throw error;
    }
  }

  async sendTemplate(data: SendTemplateEmailData): Promise<SendEmailResult> {
    this.logger.warn('SMTP provider does not support templates natively');
    throw new Error('Template emails not supported by SMTP provider');
  }

  private ensureConfigured(): void {
    if (!this.transporter) {
      throw new Error('SMTP provider is not configured');
    }
  }
}
