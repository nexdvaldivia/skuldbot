import { Module } from '@nestjs/common';
import { PoliciesService } from './policies.service';

@Module({
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
