import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  Index,
} from 'typeorm';
import { Role } from './role.entity';

/**
 * Permission categories for organization
 */
export enum PermissionCategory {
  BOTS = 'bots',
  RUNS = 'runs',
  RUNNERS = 'runners',
  SCHEDULES = 'schedules',
  USERS = 'users',
  ROLES = 'roles',
  TENANTS = 'tenants',
  AUDIT = 'audit',
  SETTINGS = 'settings',
  API_KEYS = 'api_keys',
  CREDENTIALS = 'credentials',
  EVIDENCE = 'evidence',
  AUDITORS = 'auditors',
  COMPLIANCE = 'compliance',
}

/**
 * Display names for permission categories.
 */
export const CATEGORY_DISPLAY_NAMES: Record<PermissionCategory, string> = {
  [PermissionCategory.BOTS]: 'Bot Management',
  [PermissionCategory.RUNS]: 'Run Execution',
  [PermissionCategory.RUNNERS]: 'Runner Management',
  [PermissionCategory.SCHEDULES]: 'Schedule Management',
  [PermissionCategory.USERS]: 'User Management',
  [PermissionCategory.ROLES]: 'Role Management',
  [PermissionCategory.TENANTS]: 'Tenant Administration',
  [PermissionCategory.AUDIT]: 'Audit Logs',
  [PermissionCategory.SETTINGS]: 'System Settings',
  [PermissionCategory.API_KEYS]: 'API Key Management',
  [PermissionCategory.CREDENTIALS]: 'Credential Vault',
  [PermissionCategory.EVIDENCE]: 'Evidence Packs',
  [PermissionCategory.AUDITORS]: 'Auditor Management',
  [PermissionCategory.COMPLIANCE]: 'Compliance Reports',
};

/**
 * Permission entity for granular access control.
 *
 * Naming convention: {resource}:{action}
 * Examples:
 * - bots:read, bots:write, bots:delete, bots:execute
 * - runs:read, runs:write, runs:cancel
 * - users:read, users:write, users:delete, users:invite
 * - settings:read, settings:write
 */
@Entity('permissions')
@Index(['name'], { unique: true })
@Index(['category'])
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string; // e.g., 'bots:read', 'runs:execute'

  @Column()
  displayName: string; // e.g., 'Read Bots', 'Execute Runs'

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: PermissionCategory })
  category: PermissionCategory;

  @Column({ default: false })
  isSystemPermission: boolean; // Cannot be deleted

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}

/**
 * Default permissions for the system.
 * These are seeded on first run.
 */
export const DEFAULT_PERMISSIONS: Partial<Permission>[] = [
  // Bots
  { name: 'bots:read', displayName: 'View Bots', category: PermissionCategory.BOTS, isSystemPermission: true },
  { name: 'bots:write', displayName: 'Create/Edit Bots', category: PermissionCategory.BOTS, isSystemPermission: true },
  { name: 'bots:delete', displayName: 'Delete Bots', category: PermissionCategory.BOTS, isSystemPermission: true },
  { name: 'bots:execute', displayName: 'Execute Bots', category: PermissionCategory.BOTS, isSystemPermission: true },
  { name: 'bots:export', displayName: 'Export Bots', category: PermissionCategory.BOTS, isSystemPermission: true },

  // Runs
  { name: 'runs:read', displayName: 'View Runs', category: PermissionCategory.RUNS, isSystemPermission: true },
  { name: 'runs:write', displayName: 'Create Runs', category: PermissionCategory.RUNS, isSystemPermission: true },
  { name: 'runs:cancel', displayName: 'Cancel Runs', category: PermissionCategory.RUNS, isSystemPermission: true },
  { name: 'runs:retry', displayName: 'Retry Runs', category: PermissionCategory.RUNS, isSystemPermission: true },
  { name: 'runs:logs', displayName: 'View Run Logs', category: PermissionCategory.RUNS, isSystemPermission: true },

  // Runners
  { name: 'runners:read', displayName: 'View Runners', category: PermissionCategory.RUNNERS, isSystemPermission: true },
  { name: 'runners:write', displayName: 'Create/Edit Runners', category: PermissionCategory.RUNNERS, isSystemPermission: true },
  { name: 'runners:delete', displayName: 'Delete Runners', category: PermissionCategory.RUNNERS, isSystemPermission: true },
  { name: 'runners:manage', displayName: 'Manage Runner Keys', category: PermissionCategory.RUNNERS, isSystemPermission: true },

  // Schedules
  { name: 'schedules:read', displayName: 'View Schedules', category: PermissionCategory.SCHEDULES, isSystemPermission: true },
  { name: 'schedules:write', displayName: 'Create/Edit Schedules', category: PermissionCategory.SCHEDULES, isSystemPermission: true },
  { name: 'schedules:delete', displayName: 'Delete Schedules', category: PermissionCategory.SCHEDULES, isSystemPermission: true },
  { name: 'schedules:trigger', displayName: 'Trigger Schedules', category: PermissionCategory.SCHEDULES, isSystemPermission: true },

  // Users
  { name: 'users:read', displayName: 'View Users', category: PermissionCategory.USERS, isSystemPermission: true },
  { name: 'users:write', displayName: 'Create/Edit Users', category: PermissionCategory.USERS, isSystemPermission: true },
  { name: 'users:delete', displayName: 'Delete Users', category: PermissionCategory.USERS, isSystemPermission: true },
  { name: 'users:invite', displayName: 'Invite Users', category: PermissionCategory.USERS, isSystemPermission: true },
  { name: 'users:impersonate', displayName: 'Impersonate Users', category: PermissionCategory.USERS, isSystemPermission: true },

  // Roles
  { name: 'roles:read', displayName: 'View Roles', category: PermissionCategory.ROLES, isSystemPermission: true },
  { name: 'roles:write', displayName: 'Create/Edit Roles', category: PermissionCategory.ROLES, isSystemPermission: true },
  { name: 'roles:delete', displayName: 'Delete Roles', category: PermissionCategory.ROLES, isSystemPermission: true },
  { name: 'roles:assign', displayName: 'Assign Roles', category: PermissionCategory.ROLES, isSystemPermission: true },

  // Tenants (super admin only)
  { name: 'tenants:read', displayName: 'View Tenants', category: PermissionCategory.TENANTS, isSystemPermission: true },
  { name: 'tenants:write', displayName: 'Create/Edit Tenants', category: PermissionCategory.TENANTS, isSystemPermission: true },
  { name: 'tenants:delete', displayName: 'Delete Tenants', category: PermissionCategory.TENANTS, isSystemPermission: true },
  { name: 'tenants:suspend', displayName: 'Suspend Tenants', category: PermissionCategory.TENANTS, isSystemPermission: true },

  // Audit
  { name: 'audit:read', displayName: 'View Audit Logs', category: PermissionCategory.AUDIT, isSystemPermission: true },
  { name: 'audit:export', displayName: 'Export Audit Logs', category: PermissionCategory.AUDIT, isSystemPermission: true },

  // Settings
  { name: 'settings:read', displayName: 'View Settings', category: PermissionCategory.SETTINGS, isSystemPermission: true },
  { name: 'settings:write', displayName: 'Modify Settings', category: PermissionCategory.SETTINGS, isSystemPermission: true },

  // API Keys
  { name: 'api_keys:read', displayName: 'View API Keys', category: PermissionCategory.API_KEYS, isSystemPermission: true },
  { name: 'api_keys:write', displayName: 'Create/Revoke API Keys', category: PermissionCategory.API_KEYS, isSystemPermission: true },

  // Credentials/Vault
  { name: 'credentials:read', displayName: 'View Credentials', category: PermissionCategory.CREDENTIALS, isSystemPermission: true },
  { name: 'credentials:write', displayName: 'Create/Edit Credentials', category: PermissionCategory.CREDENTIALS, isSystemPermission: true },
  { name: 'credentials:delete', displayName: 'Delete Credentials', category: PermissionCategory.CREDENTIALS, isSystemPermission: true },
  { name: 'credentials:use', displayName: 'Use Credentials in Bots', category: PermissionCategory.CREDENTIALS, isSystemPermission: true },

  // Evidence Packs
  { name: 'evidence:read', displayName: 'View Evidence Packs', category: PermissionCategory.EVIDENCE, isSystemPermission: true },
  { name: 'evidence:download', displayName: 'Download Evidence Packs', category: PermissionCategory.EVIDENCE, isSystemPermission: true },
  { name: 'evidence:verify', displayName: 'Verify Evidence Integrity', category: PermissionCategory.EVIDENCE, isSystemPermission: true },
  { name: 'evidence:decrypt', displayName: 'Decrypt Evidence Files', category: PermissionCategory.EVIDENCE, isSystemPermission: true },
  { name: 'evidence:legal_hold', displayName: 'Apply Legal Hold', category: PermissionCategory.EVIDENCE, isSystemPermission: true },
  { name: 'evidence:retention', displayName: 'Manage Retention Policies', category: PermissionCategory.EVIDENCE, isSystemPermission: true },

  // Auditor Management
  { name: 'auditors:read', displayName: 'View Auditors', category: PermissionCategory.AUDITORS, isSystemPermission: true },
  { name: 'auditors:write', displayName: 'Create/Edit Auditors', category: PermissionCategory.AUDITORS, isSystemPermission: true },
  { name: 'auditors:delete', displayName: 'Delete/Revoke Auditors', category: PermissionCategory.AUDITORS, isSystemPermission: true },
  { name: 'auditors:extend', displayName: 'Extend Auditor Access', category: PermissionCategory.AUDITORS, isSystemPermission: true },

  // Compliance Reports
  { name: 'compliance:read', displayName: 'View Compliance Reports', category: PermissionCategory.COMPLIANCE, isSystemPermission: true },
  { name: 'compliance:generate', displayName: 'Generate Attestations', category: PermissionCategory.COMPLIANCE, isSystemPermission: true },
  { name: 'compliance:export', displayName: 'Export Compliance Reports', category: PermissionCategory.COMPLIANCE, isSystemPermission: true },
  { name: 'compliance:configure', displayName: 'Configure Compliance Frameworks', category: PermissionCategory.COMPLIANCE, isSystemPermission: true },
];
