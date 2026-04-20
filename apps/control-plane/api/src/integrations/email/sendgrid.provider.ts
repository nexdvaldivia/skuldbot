import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import {
  EmailProvider,
  IntegrationType,
  SendEmailData,
  SendTemplateEmailData,
  SendEmailResult,
} from '../../common/interfaces/integration.interface';

@Injectable()
export class SendGridProvider implements EmailProvider {
  readonly name = 'sendgrid';
  readonly type = IntegrationType.EMAIL;

  private readonly logger = new Logger(SendGridProvider.name);
  private configured = false;
  private defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    this.defaultFrom = this.configService.get<string>('EMAIL_FROM', 'noreply@skuldbot.com');

    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.configured = true;
      this.logger.log('SendGrid provider initialized');
    } else {
      this.logger.warn('SendGrid provider not configured - SENDGRID_API_KEY missing');
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async healthCheck(): Promise<boolean> {
    return this.configured;
  }

  async send(data: SendEmailData): Promise<SendEmailResult> {
    this.ensureConfigured();

    const msg = {
      to: data.to,
      from: data.from || this.defaultFrom,
      subject: data.subject,
      text: data.text || '',
      html: data.html || '',
      cc: data.cc,
      bcc: data.bcc,
      replyTo: data.replyTo,
      attachments: data.attachments?.map((att) => ({
        filename: att.filename,
        content: typeof att.content === 'string' ? att.content : att.content.toString('base64'),
        type: att.contentType,
        disposition: 'attachment' as const,
      })),
    };

    try {
      const [response] = await sgMail.send(msg);
      return {
        messageId: response.headers['x-message-id'] as string || '',
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to send email', error);
      throw error;
    }
  }

  async sendTemplate(data: SendTemplateEmailData): Promise<SendEmailResult> {
    this.ensureConfigured();

    const msg = {
      to: data.to,
      from: data.from || this.defaultFrom,
      templateId: data.templateId,
      dynamicTemplateData: data.templateData,
      cc: data.cc,
      bcc: data.bcc,
    };

    try {
      const [response] = await sgMail.send(msg);
      return {
        messageId: response.headers['x-message-id'] as string || '',
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to send template email', error);
      throw error;
    }
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new Error('SendGrid provider is not configured');
    }
  }
}
