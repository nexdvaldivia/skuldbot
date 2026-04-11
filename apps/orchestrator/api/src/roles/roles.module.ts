import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { User } from '../users/entities/user.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';

/**
 * Roles Module.
 *
 * Provides role and permission management:
 * - Role CRUD operations
 * - Permission assignment
 * - Role cloning
 * - Role comparison
 *
 * Role Types:
 * - SYSTEM: Built-in roles (admin, operator, developer, viewer)
 *   - Cannot be deleted
 *   - Can have permissions modified
 *   - Name/description cannot be changed
 *
 * - CUSTOM: User-created roles
 *   - Full CRUD operations
 *   - Tenant-specific
 *
 * Permission Categories:
 * - BOTS: Bot management permissions
 * - RUNS: Run execution and monitoring
 * - RUNNERS: Runner management
 * - SCHEDULES: Schedule management
 * - USERS: User management
 * - ROLES: Role management
 * - TENANTS: Tenant settings
 * - AUDIT: Audit log access
 * - SETTINGS: System settings
 * - API_KEYS: API key management
 * - CREDENTIALS: Credential vault
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, User, AuditLog]),
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
