function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL
    ? trimTrailingSlash(process.env.NEXT_PUBLIC_API_URL)
    : null;

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;

    if (configured) {
      try {
        const url = new URL(configured);
        if (isLoopbackHost(url.hostname) && !isLoopbackHost(hostname)) {
          const port = url.port || '3005';
          return `${url.protocol}//${hostname}:${port}`;
        }
      } catch {
        return configured;
      }

      return configured;
    }

    return `${protocol}//${hostname}:3005`;
  }

  return configured ?? 'http://localhost:3005';
}

const API_BASE = resolveApiBase();

export interface RbacPermission {
  id: string;
  code: string;
  label: string;
  category: string;
  description: string | null;
}

export interface RbacRole {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  scopeType: 'platform' | 'client';
  clientId: string | null;
  clientName?: string | null;
  isSystem: boolean;
  isDefault: boolean;
  userCount?: number;
  permissions?: RbacPermission[];
  createdAt: string;
  updatedAt: string;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const url = `${API_BASE}${path}`;
  let res: Response;

  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
    });
  } catch (error) {
    throw new Error(
      `Load failed. Could not reach Control Plane API at ${url}. Verify API is running and CORS is configured.`,
    );
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }

  return res.json();
}

export const rbacApi = {
  async listPermissions() {
    return fetchApi<RbacPermission[]>('/api/rbac/permissions');
  },

  async listRoles(filters?: {
    search?: string;
    scopeType?: 'platform' | 'client';
    clientId?: string;
    includePermissions?: boolean;
    includeUserCount?: boolean;
  }) {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.scopeType) params.append('scopeType', filters.scopeType);
    if (filters?.clientId) params.append('clientId', filters.clientId);
    if (filters?.includePermissions) params.append('includePermissions', 'true');
    if (filters?.includeUserCount) params.append('includeUserCount', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<RbacRole[]>(`/api/rbac/roles${query}`);
  },

  async createRole(data: {
    name: string;
    displayName: string;
    description?: string;
    scopeType?: 'platform' | 'client';
    clientId?: string;
    permissionIds: string[];
    isDefault?: boolean;
  }) {
    return fetchApi<RbacRole>('/api/rbac/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteRole(roleId: string) {
    return fetchApi<void>(`/api/rbac/roles/${roleId}`, {
      method: 'DELETE',
    });
  },

  async assignUserRoles(userId: string, roleIds: string[]) {
    return fetchApi<RbacRole[]>(`/api/rbac/users/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    });
  },
};
