import { Module } from '@nestjs/common';

import { PaymentModule } from './payment/payment.module';
import { StorageModule } from './storage/storage.module';
import { EmailModule } from './email/email.module';
import { SmsModule } from './sms/sms.module';
import { GraphModule } from './graph/graph.module';

import { ProviderRuntimeModule } from './provider-runtime.module';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [
    ProviderRuntimeModule,
    PaymentModule,
    StorageModule,
    EmailModule,
    SmsModule,
    GraphModule,
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [
    ProviderRuntimeModule,
    IntegrationsService,
    PaymentModule,
    StorageModule,
    EmailModule,
    SmsModule,
    GraphModule,
  ],
})
export class IntegrationsModule {}
