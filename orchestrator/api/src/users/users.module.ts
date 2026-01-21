import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { ApiKey, RefreshToken, Session } from './entities/api-key.entity';
import { Role } from '../roles/entities/role.entity';
import { Permission } from '../roles/entities/permission.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { PasswordService, TokenService } from '../common/crypto/password.service';

/**
 * Users Module.
 *
 * Provides user management functionality:
 * - User CRUD operations
 * - Role assignment
 * - Status management (active, suspended, deactivated)
 * - User invitations
 * - Profile management
 * - Admin password reset
 *
 * All operations are:
 * - Tenant-isolated (multi-tenancy)
 * - Permission-controlled (RBAC)
 * - Audit logged (compliance)
 *
 * Entities managed:
 * - User: Core user entity
 * - ApiKey: API key authentication
 * - RefreshToken: JWT refresh tokens
 * - Session: Active user sessions
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      ApiKey,
      RefreshToken,
      Session,
      Role,
      Permission,
      AuditLog,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, PasswordService, TokenService],
  exports: [UsersService],
})
export class UsersModule {}
