import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';
import {
  IntegrationType,
  SendSmsData,
  SendSmsResult,
  SmsProvider,
} from '../../common/interfaces/integration.interface';

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  readonly type = IntegrationType.SMS;

  private readonly logger = new Logger(TwilioSmsProvider.name);
  private readonly client: Twilio | null;
  private readonly accountSid: string | null;
  private readonly defaultFrom: string | null;
  private readonly messagingServiceSid: string | null;

  constructor(private readonly configService: ConfigService) {
    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID') ?? null;
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') ?? null;
    this.defaultFrom = this.configService.get<string>('TWILIO_FROM_NUMBER') ?? null;
    this.messagingServiceSid =
      this.configService.get<string>('TWILIO_MESSAGING_SERVICE_SID') ?? null;

    if (this.accountSid && authToken && (this.defaultFrom || this.messagingServiceSid)) {
      this.client = twilio(this.accountSid, authToken);
      this.logger.log('Twilio SMS provider initialized');
    } else {
      this.client = null;
      this.logger.warn(
        'Twilio SMS provider not configured - missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN and sender (TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID)',
      );
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client || !this.accountSid) {
      return false;
    }

    try {
      await this.client.api.accounts(this.accountSid).fetch();
      return true;
    } catch {
      return false;
    }
  }

  async send(data: SendSmsData): Promise<SendSmsResult> {
    this.ensureConfigured();

    const sender = data.from || this.defaultFrom;
    const payload =
      sender != null
        ? { to: data.to, body: data.body, from: sender }
        : { to: data.to, body: data.body, messagingServiceSid: this.messagingServiceSid! };

    const message = await this.client!.messages.create(payload);

    return {
      messageId: message.sid,
      success: true,
      provider: this.name,
    };
  }

  private ensureConfigured(): void {
    if (!this.client) {
      throw new Error('Twilio SMS provider is not configured');
    }
    if (!this.defaultFrom && !this.messagingServiceSid) {
      throw new Error(
        'Twilio SMS sender is not configured. Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID',
      );
    }
  }
}
