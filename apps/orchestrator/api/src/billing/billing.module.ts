import { Global, Module } from '@nestjs/common';
import { BillingEnforcementService } from './billing-enforcement.service';

@Global()
@Module({
  providers: [BillingEnforcementService],
  exports: [BillingEnforcementService],
})
export class BillingModule {}
