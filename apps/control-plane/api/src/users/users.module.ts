import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { CpRole } from '../rbac/entities/cp-role.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Client, CpRole, SecurityAuditEvent])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
