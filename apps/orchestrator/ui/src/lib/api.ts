/**
 * API client for the Orchestrator backend
 */

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  let response: Response;

  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
  } catch {
    throw new Error(
      `Load failed. Could not reach Orchestrator API at ${url}. Verify API is running and gateway routing is configured.`,
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function extractArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  for (const key of keys) {
    const candidate = (payload as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) {
      return candidate as T[];
    }
  }

  return [];
}

function toIso(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

// ============================================
// Bots
// ============================================

export interface Bot {
  id: string;
  name: string;
  description?: string;
  latestVersionId?: string;
  latestVersion?: BotVersion;
  createdAt: string;
  updatedAt: string;
}

export interface BotVersion {
  id: string;
  version: string;
  status: 'draft' | 'compiled' | 'published';
  createdAt: string;
}

function normalizeBotVersionStatus(status: unknown): 'draft' | 'compiled' | 'published' {
  if (status === 'published' || status === 'active') {
    return 'published';
  }
  if (status === 'compiled') {
    return 'compiled';
  }
  return 'draft';
}

function normalizeBot(raw: Record<string, unknown>): Bot {
  const currentVersion =
    typeof raw.currentVersion === 'string'
      ? raw.currentVersion
      : typeof (raw.latestVersion as Record<string, unknown> | undefined)?.version ===
        'string'
      ? ((raw.latestVersion as Record<string, unknown>).version as string)
      : undefined;

  const latestVersion: BotVersion | undefined = currentVersion
    ? {
        id:
          (typeof raw.currentVersionId === 'string' && raw.currentVersionId) ||
          (typeof (raw.latestVersion as Record<string, unknown> | undefined)?.id ===
            'string'
            ? ((raw.latestVersion as Record<string, unknown>).id as string)
            : `${String(raw.id || 'bot')}-version`),
        version: currentVersion,
        status: normalizeBotVersionStatus(
          (raw.latestVersion as Record<string, unknown> | undefined)?.status ?? raw.status,
        ),
        createdAt: toIso(raw.updatedAt ?? raw.createdAt),
      }
    : undefined;

  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    description:
      typeof raw.description === 'string' ? raw.description : undefined,
    latestVersionId:
      typeof raw.currentVersionId === 'string'
        ? raw.currentVersionId
        : typeof raw.latestVersionId === 'string'
          ? raw.latestVersionId
          : undefined,
    latestVersion,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt ?? raw.createdAt),
  };
}

export const botsApi = {
  list: async () => {
    const payload = await fetchApi<unknown>('/bots');
    return extractArray<Record<string, unknown>>(payload, ['bots', 'data']).map(
      normalizeBot,
    );
  },
  get: async (id: string) => {
    const payload = await fetchApi<Record<string, unknown>>(`/bots/${id}`);
    return normalizeBot(payload);
  },
  create: async (data: { name: string; description?: string }) => {
    const payload = await fetchApi<Record<string, unknown>>('/bots', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return normalizeBot(payload);
  },
  delete: (id: string) =>
    fetchApi<void>(`/bots/${id}`, { method: 'DELETE' }),
};

// ============================================
// Runs
// ============================================

export type RunStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'leased';

export interface Run {
  id: string;
  botId: string;
  botVersionId: string;
  status: RunStatus;
  trigger: string;
  runnerId?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  stepsTotal?: number;
  stepsCompleted?: number;
  error?: string;
  createdAt: string;
}

export interface RunStats {
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
}

function normalizeRunStatus(status: unknown): RunStatus {
  if (status === 'succeeded') {
    return 'success';
  }
  if (status === 'timed_out') {
    return 'failed';
  }
  if (status === 'retry_scheduled' || status === 'retrying') {
    return 'queued';
  }
  if (status === 'waiting_approval') {
    return 'paused';
  }
  if (
    status === 'pending' ||
    status === 'queued' ||
    status === 'running' ||
    status === 'success' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'paused' ||
    status === 'leased'
  ) {
    return status;
  }
  return 'pending';
}

function normalizeRun(raw: Record<string, unknown>): Run {
  return {
    id: String(raw.id || ''),
    botId: String(raw.botId || ''),
    botVersionId: String(raw.botVersionId || ''),
    status: normalizeRunStatus(raw.status),
    trigger:
      typeof raw.triggerType === 'string'
        ? raw.triggerType
        : typeof raw.trigger === 'string'
          ? raw.trigger
          : 'manual',
    runnerId: typeof raw.runnerId === 'string' ? raw.runnerId : undefined,
    startedAt:
      typeof raw.startedAt === 'string' ? raw.startedAt : undefined,
    completedAt:
      typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
    durationMs:
      typeof raw.durationMs === 'number' ? raw.durationMs : undefined,
    stepsTotal:
      typeof raw.totalSteps === 'number'
        ? raw.totalSteps
        : typeof raw.stepsTotal === 'number'
          ? raw.stepsTotal
          : undefined,
    stepsCompleted:
      typeof raw.completedSteps === 'number'
        ? raw.completedSteps
        : typeof raw.stepsCompleted === 'number'
          ? raw.stepsCompleted
          : undefined,
    error:
      typeof raw.errorMessage === 'string'
        ? raw.errorMessage
        : typeof raw.error === 'string'
          ? raw.error
          : undefined,
    createdAt: toIso(raw.createdAt),
  };
}

export const runsApi = {
  list: async () => {
    const payload = await fetchApi<unknown>('/runs');
    return extractArray<Record<string, unknown>>(payload, ['runs', 'data']).map(
      normalizeRun,
    );
  },
  get: async (id: string) => {
    const payload = await fetchApi<Record<string, unknown>>(`/runs/${id}`);
    return normalizeRun(payload);
  },
  getStats: async () => {
    const payload = await fetchApi<Record<string, unknown>>('/runs/stats');
    return {
      total: Number(payload.total || 0),
      pending: Number(payload.pending || 0),
      running: Number(payload.running || 0),
      success: Number(payload.success || payload.succeeded || 0),
      failed: Number(payload.failed || 0),
      cancelled: Number(payload.cancelled || 0),
    } satisfies RunStats;
  },
  cancel: (id: string) =>
    fetchApi<void>(`/runs/${id}/cancel`, { method: 'POST' }),
};

// ============================================
// Runners
// ============================================

export type RunnerStatus =
  | 'online'
  | 'offline'
  | 'busy'
  | 'maintenance'
  | 'starting'
  | 'stopping'
  | 'draining'
  | 'disabled'
  | 'error';

export interface Runner {
  id: string;
  name: string;
  status: RunnerStatus;
  labels?: Record<string, string>;
  capabilities?: string[];
  currentRunId?: string;
  lastHeartbeat?: string;
  systemInfo?: {
    hostname: string;
    os: string;
    cpuCount: number;
    memoryTotalMb: number;
  };
  createdAt: string;
}

export interface RunnerStats {
  total: number;
  online: number;
  offline: number;
  busy: number;
}

export interface RegisterRunnerRequest {
  name: string;
  labels?: Record<string, string>;
  capabilities?: string[];
  agentVersion?: string;
  systemInfo?: {
    os?: string;
    hostname?: string;
    cpuCount?: number;
    memoryMb?: number;
  };
}

export interface RegisterRunnerResponse {
  runner: Runner;
  apiKey: string;
}

function normalizeRunner(raw: Record<string, unknown>): Runner {
  const rawSystemInfo =
    raw.systemInfo && typeof raw.systemInfo === 'object'
      ? (raw.systemInfo as Record<string, unknown>)
      : undefined;

  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    status: (String(raw.status || 'offline') as RunnerStatus),
    labels:
      raw.labels && typeof raw.labels === 'object'
        ? (raw.labels as Record<string, string>)
        : undefined,
    capabilities: Array.isArray(raw.capabilities)
      ? raw.capabilities.map((cap) => String(cap))
      : undefined,
    currentRunId:
      typeof raw.currentRunId === 'string' ? raw.currentRunId : undefined,
    lastHeartbeat:
      typeof raw.lastHeartbeatAt === 'string'
        ? raw.lastHeartbeatAt
        : typeof raw.lastHeartbeat === 'string'
          ? raw.lastHeartbeat
          : undefined,
    systemInfo: rawSystemInfo
      ? {
          hostname: String(rawSystemInfo.hostname || 'unknown'),
          os: String(rawSystemInfo.os || 'unknown'),
          cpuCount: Number(rawSystemInfo.cpuCount || 0),
          memoryTotalMb: Number(
            rawSystemInfo.memoryTotalMb || rawSystemInfo.memoryMb || 0,
          ),
        }
      : undefined,
    createdAt: toIso(raw.createdAt),
  };
}

export const runnersApi = {
  list: async () => {
    const payload = await fetchApi<unknown>('/runners');
    return extractArray<Record<string, unknown>>(payload, ['runners', 'data']).map(
      normalizeRunner,
    );
  },
  get: async (id: string) => {
    const payload = await fetchApi<Record<string, unknown>>(`/runners/${id}`);
    return normalizeRunner(payload);
  },
  register: async (data: RegisterRunnerRequest) => {
    const payload = await fetchApi<{
      runner: Record<string, unknown>;
      apiKey: string;
    }>('/runners/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    return {
      runner: normalizeRunner(payload.runner),
      apiKey: payload.apiKey,
    } satisfies RegisterRunnerResponse;
  },
  getStats: () => fetchApi<RunnerStats>('/runners/stats'),
  delete: (id: string) =>
    fetchApi<void>(`/runners/${id}`, { method: 'DELETE' }),
  regenerateKey: (id: string) =>
    fetchApi<{ apiKey: string }>(`/runners/${id}/regenerate-key`, {
      method: 'POST',
    }),
};

// ============================================
// Schedules
// ============================================

export type ScheduleStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'disabled'
  | 'expired'
  | 'error'
  | 'quota_exceeded';

export type ScheduleTriggerType = 'cron' | 'interval' | 'calendar' | 'event' | 'webhook';

export interface Schedule {
  id: string;
  name: string;
  botId: string;
  botVersionId?: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  status: ScheduleStatus;
  triggerType: ScheduleTriggerType;
  targetType: 'any' | 'pool' | 'pinned' | 'capability' | 'affinity' | 'round_robin' | 'least_loaded';
  pinnedRunnerId?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
}

export interface CreateScheduleRequest {
  name: string;
  description?: string;
  botId: string;
  triggerType: 'cron' | 'interval';
  cronExpression?: string;
  intervalMinutes?: number;
  timezone?: string;
  useLatestVersion?: boolean;
  targetType?: 'any' | 'pinned';
  targetRunnerId?: string;
}

function normalizeSchedule(raw: Record<string, unknown>): Schedule {
  const triggerType = String(raw.triggerType || 'cron') as ScheduleTriggerType;
  const cronExpression =
    typeof raw.cronExpression === 'string'
      ? raw.cronExpression
      : typeof raw.cron === 'string'
        ? raw.cron
        : triggerType === 'interval' && typeof raw.intervalMinutes === 'number'
          ? `*/${raw.intervalMinutes} * * * *`
          : '-';

  const status = String(raw.status || 'draft') as ScheduleStatus;

  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    botId: String(raw.botId || ''),
    botVersionId:
      typeof raw.botVersionId === 'string' ? raw.botVersionId : undefined,
    cron: cronExpression,
    timezone:
      typeof raw.timezone === 'string' && raw.timezone
        ? raw.timezone
        : 'UTC',
    enabled: status === 'active',
    status,
    triggerType,
    targetType: (String(raw.targetType || 'any') as Schedule['targetType']),
    pinnedRunnerId:
      typeof raw.targetRunnerId === 'string'
        ? raw.targetRunnerId
        : typeof raw.pinnedRunnerId === 'string'
          ? raw.pinnedRunnerId
          : undefined,
    lastRunAt:
      typeof raw.lastRunAt === 'string' ? raw.lastRunAt : undefined,
    nextRunAt:
      typeof raw.nextRunAt === 'string' ? raw.nextRunAt : undefined,
    createdAt: toIso(raw.createdAt),
  };
}

export const schedulesApi = {
  list: async () => {
    const payload = await fetchApi<unknown>('/schedules');
    return extractArray<Record<string, unknown>>(payload, ['data', 'schedules']).map(
      normalizeSchedule,
    );
  },
  get: async (id: string) => {
    const payload = await fetchApi<Record<string, unknown>>(`/schedules/${id}`);
    return normalizeSchedule(payload);
  },
  create: async (data: CreateScheduleRequest) => {
    const payload = await fetchApi<Record<string, unknown>>('/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return normalizeSchedule(payload);
  },
  update: async (id: string, data: Partial<CreateScheduleRequest>) => {
    const payload = await fetchApi<Record<string, unknown>>(`/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return normalizeSchedule(payload);
  },
  delete: (id: string) =>
    fetchApi<void>(`/schedules/${id}`, { method: 'DELETE' }),
  activate: async (id: string) => {
    const payload = await fetchApi<Record<string, unknown>>(
      `/schedules/${id}/activate`,
      { method: 'POST' },
    );
    return normalizeSchedule(payload);
  },
  resume: async (id: string) => {
    const payload = await fetchApi<Record<string, unknown>>(
      `/schedules/${id}/resume`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    return normalizeSchedule(payload);
  },
  disable: async (id: string, reason?: string) => {
    const payload = await fetchApi<Record<string, unknown>>(
      `/schedules/${id}/disable`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    );
    return normalizeSchedule(payload);
  },
  trigger: (id: string) =>
    fetchApi<{ runId: string }>(`/schedules/${id}/trigger`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

// ============================================
// Users / Roles
// ============================================

export type UserStatus =
  | 'active'
  | 'suspended'
  | 'pending_verification'
  | 'locked'
  | 'deactivated';

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  type?: 'system' | 'custom';
  isDefault?: boolean;
  permissions?: Permission[];
  userCount?: number;
}

export interface Permission {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: string;
}

export interface PermissionsByCategory {
  category: string;
  categoryDisplayName: string;
  permissions: Permission[];
}

export interface CreateRoleRequest {
  name: string;
  displayName: string;
  description?: string;
  permissionIds: string[];
  isDefault?: boolean;
}

export interface OrchestratorUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  roles: Role[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface InviteUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
  message?: string;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
}

export interface PaginatedUsers {
  users: OrchestratorUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function normalizeRole(raw: Record<string, unknown>): Role {
  const permissionsRaw = Array.isArray(raw.permissions)
    ? (raw.permissions as Record<string, unknown>[])
    : [];

  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    displayName:
      typeof raw.displayName === 'string' ? raw.displayName : String(raw.name || ''),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    type: raw.type === 'system' || raw.type === 'custom' ? raw.type : undefined,
    isDefault: typeof raw.isDefault === 'boolean' ? raw.isDefault : undefined,
    permissions: permissionsRaw.map(normalizePermission),
    userCount: typeof raw.userCount === 'number' ? raw.userCount : undefined,
  };
}

function normalizePermission(raw: Record<string, unknown>): Permission {
  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    displayName:
      typeof raw.displayName === 'string' ? raw.displayName : String(raw.name || ''),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    category: typeof raw.category === 'string' ? raw.category : 'general',
  };
}

function normalizeUser(raw: Record<string, unknown>): OrchestratorUser {
  const rolesRaw = Array.isArray(raw.roles)
    ? (raw.roles as Record<string, unknown>[])
    : [];

  return {
    id: String(raw.id || ''),
    email: String(raw.email || ''),
    firstName: String(raw.firstName || ''),
    lastName: String(raw.lastName || ''),
    status: (String(raw.status || 'pending_verification') as UserStatus),
    roles: rolesRaw.map(normalizeRole),
    lastLoginAt: typeof raw.lastLoginAt === 'string' ? raw.lastLoginAt : null,
    createdAt: toIso(raw.createdAt),
  };
}

export const usersApi = {
  list: async (params?: ListUsersParams): Promise<PaginatedUsers> => {
    const query = new URLSearchParams();

    if (params?.page) {
      query.set('page', String(params.page));
    }
    if (params?.limit) {
      query.set('limit', String(params.limit));
    }
    if (params?.search) {
      query.set('search', params.search);
    }
    if (params?.status) {
      query.set('status', params.status);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const payload = await fetchApi<Record<string, unknown>>(`/users${suffix}`);

    const users = extractArray<Record<string, unknown>>(payload, ['users', 'data']).map(
      normalizeUser,
    );

    return {
      users,
      total: Number(payload.total || users.length),
      page: Number(payload.page || params?.page || 1),
      limit: Number(payload.limit || params?.limit || 20),
      totalPages: Number(payload.totalPages || 1),
    };
  },

  invite: async (data: InviteUserRequest): Promise<void> => {
    await fetchApi('/users/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateStatus: async (
    id: string,
    data: { status: UserStatus; reason?: string },
  ): Promise<OrchestratorUser> => {
    const payload = await fetchApi<Record<string, unknown>>(`/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return normalizeUser(payload);
  },

  delete: (id: string) =>
    fetchApi<void>(`/users/${id}`, {
      method: 'DELETE',
    }),

  resendInvite: (id: string) =>
    fetchApi<{ message: string }>(`/users/${id}/resend-invite`, {
      method: 'POST',
    }),
};

export const rolesApi = {
  list: async (params?: {
    search?: string;
    type?: 'system' | 'custom';
    includePermissions?: boolean;
    includeUserCount?: boolean;
  }): Promise<Role[]> => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.type) query.set('type', params.type);
    if (params?.includePermissions) query.set('includePermissions', 'true');
    if (params?.includeUserCount) query.set('includeUserCount', 'true');

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const payload = await fetchApi<unknown>(`/roles${suffix}`);
    return extractArray<Record<string, unknown>>(payload, ['roles', 'data']).map(
      normalizeRole,
    );
  },

  getPermissions: async (): Promise<PermissionsByCategory[]> => {
    const payload = await fetchApi<unknown>('/roles/permissions');
    const categories = extractArray<Record<string, unknown>>(payload, ['categories', 'data']);
    return categories.map((category) => {
      const permissionsRaw = Array.isArray(category.permissions)
        ? (category.permissions as Record<string, unknown>[])
        : [];

      return {
        category: String(category.category || ''),
        categoryDisplayName:
          typeof category.categoryDisplayName === 'string'
            ? category.categoryDisplayName
            : String(category.category || ''),
        permissions: permissionsRaw.map(normalizePermission),
      };
    });
  },

  create: async (data: CreateRoleRequest): Promise<Role> => {
    const payload = await fetchApi<Record<string, unknown>>('/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return normalizeRole(payload);
  },

  delete: (id: string) =>
    fetchApi<void>(`/roles/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// Audit Logs
// ============================================

export interface AuditLog {
  id: string;
  timestamp: string;
  category: string;
  action: string;
  result: 'success' | 'failure' | 'denied';
  userId?: string;
  userEmail?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  errorMessage?: string;
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  action?: string;
  result?: 'success' | 'failure' | 'denied';
}

export interface PaginatedAuditLogs {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function normalizeAuditLog(raw: Record<string, unknown>): AuditLog {
  return {
    id: String(raw.id || ''),
    timestamp: toIso(raw.timestamp || raw.createdAt),
    category: String(raw.category || 'system'),
    action: String(raw.action || 'read'),
    result: (String(raw.result || 'success') as AuditLog['result']),
    userId: typeof raw.userId === 'string' ? raw.userId : undefined,
    userEmail: typeof raw.userEmail === 'string' ? raw.userEmail : undefined,
    resourceType:
      typeof raw.resourceType === 'string' ? raw.resourceType : undefined,
    resourceId: typeof raw.resourceId === 'string' ? raw.resourceId : undefined,
    ipAddress: typeof raw.ipAddress === 'string' ? raw.ipAddress : undefined,
    errorMessage:
      typeof raw.errorMessage === 'string' ? raw.errorMessage : undefined,
  };
}

export const auditApi = {
  list: async (params?: ListAuditLogsParams): Promise<PaginatedAuditLogs> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.action) query.set('action', params.action);
    if (params?.result) query.set('result', params.result);

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const payload = await fetchApi<Record<string, unknown>>(`/audit${suffix}`);

    const logs = extractArray<Record<string, unknown>>(payload, ['logs', 'data']).map(
      normalizeAuditLog,
    );

    return {
      logs,
      total: Number(payload.total || logs.length),
      page: Number(payload.page || params?.page || 1),
      limit: Number(payload.limit || params?.limit || logs.length || 50),
      totalPages: Number(payload.totalPages || 1),
    };
  },
};

// ============================================
// Tenant Settings
// ============================================

export interface TenantSettings {
  id: string | null;
  tenantId: string;
  organizationName: string;
  organizationSlug: string;
  logoUrl: string | null;
  preferences: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateTenantSettingsRequest {
  organizationName?: string;
  organizationSlug?: string;
  logoUrl?: string;
  preferences?: Record<string, unknown>;
}

export const settingsApi = {
  get: () => fetchApi<TenantSettings>('/settings'),
  update: (data: UpdateTenantSettingsRequest) =>
    fetchApi<TenantSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ============================================
// SSO
// ============================================

export interface OrchestratorSsoConfig {
  enabled: boolean;
  enforced: boolean;
  protocol?: 'saml' | 'oidc';
  provider?: string;
  autoProvision: boolean;
  allowedDomains: string[];
  defaultRoleId?: string;
  saml?: {
    entityId: string;
    ssoUrl: string;
    sloUrl?: string;
    hasCertificate: boolean;
    signRequests: boolean;
    wantAssertionsSigned: boolean;
    attributeMapping: {
      email: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      groups?: string;
    };
  };
  oidc?: {
    provider: string;
    clientId: string;
    hasClientSecret: boolean;
    discoveryUrl?: string;
    scopes: string[];
    pkce: boolean;
    claimMapping: {
      email: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      groups?: string;
      picture?: string;
    };
  };
}

export const ssoApi = {
  getConfig: () => fetchApi<OrchestratorSsoConfig>('/sso/config'),
};
