import { Module } from '@nestjs/common';
import { ManifestsService } from './manifests.service';

@Module({
  providers: [ManifestsService],
  exports: [ManifestsService],
})
export class ManifestsModule {}
