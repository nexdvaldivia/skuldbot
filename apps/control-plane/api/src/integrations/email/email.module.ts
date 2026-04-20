import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SendGridProvider } from './sendgrid.provider';
import { SmtpProvider } from './smtp.provider';
import { EmailProvider } from '../../common/interfaces/integration.interface';

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    SendGridProvider,
    SmtpProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        configService: ConfigService,
        sendgrid: SendGridProvider,
        smtp: SmtpProvider,
      ): EmailProvider => {
        const provider = configService.get<string>('EMAIL_PROVIDER', 'sendgrid');

        switch (provider) {
          case 'smtp':
            return smtp;
          case 'sendgrid':
          default:
            return sendgrid;
        }
      },
      inject: [ConfigService, SendGridProvider, SmtpProvider],
    },
  ],
  exports: [EMAIL_PROVIDER, SendGridProvider, SmtpProvider],
})
export class EmailModule {}
