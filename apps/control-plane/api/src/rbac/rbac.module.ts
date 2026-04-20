import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { CpPermission } from './entities/cp-permission.entity';
import { CpRole } from './entities/cp-role.entity';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CpRole, CpPermission, User, Client, SecurityAuditEvent])],
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
