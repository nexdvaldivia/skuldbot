import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicLeadsController } from './public-leads.controller';
import { PublicLeadsService } from './public-leads.service';
import { Lead, LeadIntakeEvent } from './entities/lead.entity';
import { PublicLeadsSignatureGuard } from './guards/public-leads-signature.guard';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadIntakeEvent]), TicketsModule],
  controllers: [PublicLeadsController],
  providers: [PublicLeadsService, PublicLeadsSignatureGuard],
  exports: [PublicLeadsService],
})
export class PublicLeadsModule {}
