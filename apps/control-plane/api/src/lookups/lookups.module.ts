import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LookupDomain } from './entities/lookup-domain.entity';
import { LookupValue } from './entities/lookup-value.entity';
import { LookupsService } from './lookups.service';
import { LookupsController } from './lookups.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LookupDomain, LookupValue])],
  providers: [LookupsService],
  controllers: [LookupsController],
  exports: [LookupsService],
})
export class LookupsModule {}
