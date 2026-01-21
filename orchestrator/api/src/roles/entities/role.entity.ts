import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';
import { Permission } from './permission.entity';
import { User } from '../../users/entities/user.entity';

export enum RoleType {
  SYSTEM = 'system',   // Built-in roles (cannot be deleted)
  CUSTOM = 'custom',   // Tenant-created roles
}

/**
 * Role entity for Role-Based Access Control (RBAC).
 *
 * Roles are tenant-scoped, meaning each tenant can have their own
 * custom roles in addition to system-defined roles.
 *
 * System roles are created at tenant provisioning and cannot be deleted:
 * - admin: Full access to everything
 * - operator: Can manage bots, runs, schedules
 * - developer: Can create and edit bots, view runs
 * - viewer: Read-only access
 */
@Entity('roles')
@Index(['tenantId', 'name'], { unique: true })
@Index(['tenantId', 'type'])
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  @Column()
  name: string; // e.g., 'admin', 'operator', 'viewer', 'custom-role'

  @Column()
  displayName: string; // e.g., 'Administrator', 'Operator', 'Viewer'

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: RoleType, default: RoleType.CUSTOM })
  type: RoleType;

  @Column({ default: 0 })
  priority: number; // Higher priority roles take precedence in conflicts

  @Column({ default: false })
  isDefault: boolean; // Is this the default role assigned to new users

  @ManyToMany(() => Permission, (permission) => permission.roles, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'roleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permissionId', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper to check if role has a specific permission
  hasPermission(permissionName: string): boolean {
    return this.permissions?.some((p) => p.name === permissionName);
  }
}

/**
 * Default system roles with their permissions.
 * These are created for each new tenant.
 */
export const DEFAULT_ROLES = {
  ADMIN: {
    name: 'admin',
    displayName: 'Administrator',
    description: 'Full access to all features and settings',
    type: RoleType.SYSTEM,
    priority: 100,
    permissions: ['*'], // All permissions
  },
  OPERATOR: {
    name: 'operator',
    displayName: 'Operator',
    description: 'Can manage bots, runs, and schedules',
    type: RoleType.SYSTEM,
    priority: 50,
    permissions: [
      'bots:read', 'bots:write', 'bots:execute',
      'runs:read', 'runs:write', 'runs:cancel', 'runs:retry', 'runs:logs',
      'runners:read',
      'schedules:read', 'schedules:write', 'schedules:delete', 'schedules:trigger',
      'credentials:read', 'credentials:use',
    ],
  },
  DEVELOPER: {
    name: 'developer',
    displayName: 'Developer',
    description: 'Can create and edit bots, view runs',
    type: RoleType.SYSTEM,
    priority: 30,
    permissions: [
      'bots:read', 'bots:write', 'bots:export',
      'runs:read', 'runs:logs',
      'runners:read',
      'schedules:read',
      'credentials:read', 'credentials:use',
    ],
  },
  VIEWER: {
    name: 'viewer',
    displayName: 'Viewer',
    description: 'Read-only access to view bots, runs, and schedules',
    type: RoleType.SYSTEM,
    priority: 10,
    permissions: [
      'bots:read',
      'runs:read', 'runs:logs',
      'runners:read',
      'schedules:read',
    ],
  },
};
