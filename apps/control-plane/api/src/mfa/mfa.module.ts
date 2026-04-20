import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import { User } from '../users/entities/user.entity';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, SecurityAuditEvent])],
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
