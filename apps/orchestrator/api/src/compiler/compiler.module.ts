import { Module } from '@nestjs/common';
import { CompilerService } from './compiler.service';
import { ManifestsModule } from '../manifests/manifests.module';
import { PoliciesModule } from '../policies/policies.module';

@Module({
  imports: [ManifestsModule, PoliciesModule],
  providers: [CompilerService],
  exports: [CompilerService],
})
export class CompilerModule {}
