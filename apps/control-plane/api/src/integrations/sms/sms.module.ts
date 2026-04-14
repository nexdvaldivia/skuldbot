import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NoopSmsProvider } from './noop-sms.provider';

export const SMS_PROVIDER = 'SMS_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    NoopSmsProvider,
    {
      provide: SMS_PROVIDER,
      useExisting: NoopSmsProvider,
    },
  ],
  exports: [SMS_PROVIDER, NoopSmsProvider],
})
export class SmsModule {}
