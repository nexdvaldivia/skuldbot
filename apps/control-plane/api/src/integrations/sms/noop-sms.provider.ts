import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationType,
  SendSmsData,
  SendSmsResult,
  SmsProvider,
} from '../../common/interfaces/integration.interface';

@Injectable()
export class NoopSmsProvider implements SmsProvider {
  readonly name = 'noop-sms';
  readonly type = IntegrationType.SMS;

  private readonly logger = new Logger(NoopSmsProvider.name);
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<string>('SMS_NOOP_ENABLED', 'false') === 'true';
    if (this.enabled) {
      this.logger.log('Noop SMS provider initialized (development mode)');
    } else {
      this.logger.warn('Noop SMS provider disabled');
    }
  }

  isConfigured(): boolean {
    return this.enabled;
  }

  async healthCheck(): Promise<boolean> {
    return this.enabled;
  }

  async send(data: SendSmsData): Promise<SendSmsResult> {
    if (!this.enabled) {
      throw new Error('Noop SMS provider is disabled');
    }

    this.logger.log(`Noop SMS send -> to: ${data.to}, length: ${data.body.length}`);
    return {
      messageId: `noop-${Date.now()}`,
      success: true,
      provider: this.name,
    };
  }
}
