import { UserRole } from '../../users/entities/user.entity';

export const CP_PERMISSIONS = {
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_DELETE: 'roles:delete',
  ROLES_ASSIGN: 'roles:assign',

  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  USERS_STATUS: 'users:status',

  CLIENTS_READ: 'clients:read',
  CLIENTS_WRITE: 'clients:write',
  CLIENTS_DELETE: 'clients:delete',

  TENANTS_READ: 'tenants:read',
  TENANTS_WRITE: 'tenants:write',
  TENANTS_DELETE: 'tenants:delete',

  LICENSES_READ: 'licenses:read',
  LICENSES_WRITE: 'licenses:write',
  LICENSES_REVOKE: 'licenses:revoke',

  SSO_READ: 'sso:read',
  SSO_WRITE: 'sso:write',
  SSO_TEST: 'sso:test',

  INTEGRATIONS_READ: 'integrations:read',
  INTEGRATIONS_WRITE: 'integrations:write',
  INTEGRATIONS_TEST: 'integrations:test',

  LOOKUPS_READ: 'lookups:read',
  LOOKUPS_WRITE: 'lookups:write',

  ORCHESTRATORS_READ: 'orchestrators:read',

  CONTRACTS_READ: 'contracts:read',
  CONTRACTS_WRITE: 'contracts:write',
  CONTRACTS_SIGN: 'contracts:sign',
  CONTRACTS_APPROVE: 'contracts:approve',

  BILLING_READ: 'billing:read',
  BILLING_WRITE: 'billing:write',
  BILLING_APPROVE: 'billing:approve',

  MCP_READ: 'mcp:read',
  MCP_EXECUTE: 'mcp:execute',

  SCHEMAS_READ: 'schemas:read',
  SCHEMAS_WRITE: 'schemas:write',
} as const;

export type ControlPlanePermission = (typeof CP_PERMISSIONS)[keyof typeof CP_PERMISSIONS];

const ROLE_PERMISSION_MAP: Record<UserRole, string[]> = {
  [UserRole.SKULD_ADMIN]: ['*'],
  [UserRole.SKULD_SUPPORT]: [
    CP_PERMISSIONS.ROLES_READ,
    CP_PERMISSIONS.USERS_READ,
    CP_PERMISSIONS.CLIENTS_READ,
    CP_PERMISSIONS.TENANTS_READ,
    CP_PERMISSIONS.LICENSES_READ,
    CP_PERMISSIONS.SSO_READ,
    CP_PERMISSIONS.SSO_TEST,
    CP_PERMISSIONS.INTEGRATIONS_READ,
    CP_PERMISSIONS.INTEGRATIONS_TEST,
    CP_PERMISSIONS.LOOKUPS_READ,
    CP_PERMISSIONS.ORCHESTRATORS_READ,
    CP_PERMISSIONS.CONTRACTS_READ,
    CP_PERMISSIONS.BILLING_READ,
    CP_PERMISSIONS.MCP_READ,
    CP_PERMISSIONS.SCHEMAS_READ,
  ],
  [UserRole.CLIENT_ADMIN]: [
    CP_PERMISSIONS.ROLES_READ,
    CP_PERMISSIONS.ROLES_ASSIGN,
    CP_PERMISSIONS.CLIENTS_READ,
    CP_PERMISSIONS.CLIENTS_WRITE,
    CP_PERMISSIONS.TENANTS_READ,
    CP_PERMISSIONS.TENANTS_WRITE,
    CP_PERMISSIONS.SSO_READ,
    CP_PERMISSIONS.SSO_WRITE,
    CP_PERMISSIONS.SSO_TEST,
    CP_PERMISSIONS.INTEGRATIONS_READ,
    CP_PERMISSIONS.INTEGRATIONS_WRITE,
    CP_PERMISSIONS.INTEGRATIONS_TEST,
    CP_PERMISSIONS.LOOKUPS_READ,
    CP_PERMISSIONS.CONTRACTS_READ,
    CP_PERMISSIONS.CONTRACTS_WRITE,
    CP_PERMISSIONS.CONTRACTS_SIGN,
    CP_PERMISSIONS.BILLING_READ,
    CP_PERMISSIONS.MCP_READ,
    CP_PERMISSIONS.SCHEMAS_READ,
  ],
  [UserRole.CLIENT_USER]: [CP_PERMISSIONS.CONTRACTS_READ],
};

export function getRolePermissions(role: UserRole | null | undefined): string[] {
  if (!role) {
    return [];
  }

  return ROLE_PERMISSION_MAP[role] ?? [];
}

export function hasPermission(
  grantedPermissions: string[] | null | undefined,
  requiredPermission: string,
): boolean {
  if (!grantedPermissions || grantedPermissions.length === 0) {
    return false;
  }

  if (grantedPermissions.includes('*')) {
    return true;
  }

  if (grantedPermissions.includes(requiredPermission)) {
    return true;
  }

  const [requiredResource] = requiredPermission.split(':');
  if (!requiredResource) {
    return false;
  }

  return grantedPermissions.includes(`${requiredResource}:*`);
}

type UserRoleLike = {
  name?: string;
  permissions?: Array<{
    code?: string;
  }>;
};

type UserRbacLike = {
  role?: UserRole | string | null;
  metadata?: unknown;
  roles?: UserRoleLike[];
};

export function getUserRoleNames(user: UserRbacLike | null | undefined): string[] {
  if (!user) {
    return [];
  }

  const names = new Set<string>();

  if (typeof user.role === 'string' && user.role.length > 0) {
    names.add(user.role);
  }

  for (const role of user.roles ?? []) {
    if (role?.name && typeof role.name === 'string') {
      names.add(role.name);
    }
  }

  return Array.from(names);
}

export function getUserGrantedPermissions(user: UserRbacLike | null | undefined): string[] {
  if (!user) {
    return [];
  }

  const grantedSet = new Set<string>();

  if (user.role && Object.values(UserRole).includes(user.role as UserRole)) {
    for (const permission of getRolePermissions(user.role as UserRole)) {
      grantedSet.add(permission);
    }
  }

  for (const roleName of getUserRoleNames(user)) {
    if (Object.values(UserRole).includes(roleName as UserRole)) {
      for (const permission of getRolePermissions(roleName as UserRole)) {
        grantedSet.add(permission);
      }
    }
  }

  for (const role of user.roles ?? []) {
    for (const permission of role.permissions ?? []) {
      if (permission?.code && typeof permission.code === 'string') {
        grantedSet.add(permission.code);
      }
    }
  }

  const metadataRbac = readObject(readObject(user.metadata)['rbac']);
  const extraPermissions = readStringArray(metadataRbac['extraPermissions']);
  const deniedPermissions = readStringArray(metadataRbac['deniedPermissions']);

  for (const permission of extraPermissions) {
    grantedSet.add(permission);
  }

  for (const denied of deniedPermissions) {
    grantedSet.delete(denied);
  }

  return Array.from(grantedSet);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
