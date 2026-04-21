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

export interface Client {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'suspended' | 'pending' | 'canceled';
  billingEmail: string;
  tenantsCount: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  environment: 'production' | 'staging' | 'development' | 'qa';
  deploymentType: 'saas' | 'on_premise' | 'hybrid';
  status: 'active' | 'provisioning' | 'suspended' | 'deactivated' | 'error';
  region: string | null;
  apiUrl: string | null;
  uiUrl: string | null;
  activeLicenseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SsoProvider =
  | 'azure-entra-id'
  | 'google'
  | 'aws-cognito'
  | 'okta-oidc'
  | 'auth0'
  | 'keycloak'
  | 'oidc';

export interface TenantSsoConfig {
  tenantId: string;
  tenantSlug: string;
  licenseId: string | null;
  enabled: boolean;
  enforced: boolean;
  provider: SsoProvider | null;
  protocol: 'oidc' | null;
  autoProvision: boolean;
  jitProvisioning: boolean;
  allowedDomains: string[];
  defaultRoleId?: string;
  oidc: {
    clientId: string;
    hasClientSecret: boolean;
    discoveryUrl?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
    jwksUrl?: string;
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
    groupMapping?: Record<string, string>;
  } | null;
  updatedAt: string | null;
}

export type IntegrationProviderType = 'payment' | 'email' | 'storage' | 'graph';

export interface IntegrationProviderConfig {
  id: string;
  type: IntegrationProviderType;
  name: string;
  tenantId: string | null;
  isActive: boolean;
  isPrimary: boolean;
  settings: Record<string, unknown>;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  hasCredentials: boolean;
  credentialKeys: string[];
}

export interface License {
  id: string;
  tenantId: string;
  key: string;
  type: 'trial' | 'standard' | 'professional' | 'enterprise';
  status: 'active' | 'expired' | 'revoked' | 'suspended';
  validFrom: string;
  validUntil: string;
  isValid: boolean;
  features: LicenseFeatures;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseFeatures {
  maxBots: number;
  maxRunners: number;
  maxConcurrentRuns: number;
  maxRunsPerMonth: number;
  aiAssistant: boolean;
  customNodes: boolean;
  apiAccess: boolean;
  sso: boolean;
  auditLog: boolean;
  prioritySupport: boolean;
}

export interface LicenseRuntimeDecision {
  id: string;
  tenantId: string;
  decisionType: 'entitlement_check' | 'quota_check' | 'quota_consume';
  resourceType: string;
  requested: number;
  projected: number;
  limit: number | null;
  period: string | null;
  state: 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked' | string | null;
  allowed: boolean;
  consumed: boolean | null;
  reason: string | null;
  orchestratorId: string | null;
  traceId: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'skuld_admin' | 'skuld_support' | 'client_admin' | 'client_user';
  roles?: Array<{
    id: string;
    name: string;
    displayName: string;
  }>;
  permissions?: string[];
  status: 'active' | 'pending' | 'suspended' | 'deactivated';
  clientId: string | null;
  clientName: string | null;
  lastLoginAt: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  } catch {
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

// Auth API
export const authApi = {
  async login(email: string, password: string) {
    const res = await fetchApi<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('token', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    return res;
  },

  async logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  },

  async me() {
    return fetchApi<User>('/api/auth/me');
  },
};

// Clients API
export const clientsApi = {
  async list() {
    return fetchApi<Client[]>('/api/clients');
  },

  async get(id: string) {
    return fetchApi<Client>(`/api/clients/${id}`);
  },

  async create(data: { name: string; slug: string; billingEmail: string; plan?: string }) {
    return fetchApi<Client>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<Client>) {
    return fetchApi<Client>(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchApi<void>(`/api/clients/${id}`, { method: 'DELETE' });
  },

  async activate(id: string) {
    return fetchApi<Client>(`/api/clients/${id}/activate`, { method: 'POST' });
  },

  async suspend(id: string) {
    return fetchApi<Client>(`/api/clients/${id}/suspend`, { method: 'POST' });
  },
};

// Tenants API
export const tenantsApi = {
  async list(clientId?: string) {
    const query = clientId ? `?clientId=${clientId}` : '';
    return fetchApi<Tenant[]>(`/api/tenants${query}`);
  },

  async get(id: string) {
    return fetchApi<Tenant>(`/api/tenants/${id}`);
  },

  async create(data: {
    clientId: string;
    name: string;
    slug: string;
    environment?: string;
    deploymentType?: string;
    region?: string;
  }) {
    return fetchApi<Tenant>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<Tenant>) {
    return fetchApi<Tenant>(`/api/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchApi<void>(`/api/tenants/${id}`, { method: 'DELETE' });
  },

  async activate(id: string) {
    return fetchApi<Tenant>(`/api/tenants/${id}/activate`, { method: 'POST' });
  },

  async suspend(id: string) {
    return fetchApi<Tenant>(`/api/tenants/${id}/suspend`, { method: 'POST' });
  },
};

export const ssoApi = {
  async getTenantConfig(tenantId: string) {
    return fetchApi<TenantSsoConfig>(`/api/sso/tenants/${tenantId}/config`);
  },

  async updateTenantConfig(
    tenantId: string,
    data: {
      enabled: boolean;
      enforced?: boolean;
      autoProvision?: boolean;
      jitProvisioning?: boolean;
      allowedDomains?: string[];
      defaultRoleId?: string;
      provider: SsoProvider;
      protocol?: 'oidc';
      clientId: string;
      clientSecret?: string;
      discoveryUrl?: string;
      authorizationUrl?: string;
      tokenUrl?: string;
      userInfoUrl?: string;
      jwksUrl?: string;
      scopes: string[];
      pkce?: boolean;
      claimMapping: {
        email: string;
        firstName?: string;
        lastName?: string;
        displayName?: string;
        groups?: string;
        picture?: string;
      };
      groupMapping?: Record<string, string>;
    },
  ) {
    return fetchApi<TenantSsoConfig>(`/api/sso/tenants/${tenantId}/config`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async testTenantConfig(
    tenantId: string,
    data: {
      discoveryUrl?: string;
      authorizationUrl?: string;
      tokenUrl?: string;
    },
  ) {
    return fetchApi<{ success: boolean; message: string; details?: Record<string, unknown> }>(
      `/api/sso/tenants/${tenantId}/test`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  },
};

export const integrationsApi = {
  async list(type?: IntegrationProviderType, tenantId?: string) {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (tenantId) params.append('tenantId', tenantId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<IntegrationProviderConfig[]>(`/api/integrations/providers${query}`);
  },

  async get(id: string) {
    return fetchApi<IntegrationProviderConfig>(`/api/integrations/providers/${id}`);
  },

  async upsert(data: {
    type: IntegrationProviderType;
    name: string;
    tenantId?: string;
    isActive?: boolean;
    isPrimary?: boolean;
    settings?: Record<string, unknown>;
    credentials?: Record<string, string>;
    description?: string;
  }) {
    return fetchApi<IntegrationProviderConfig>('/api/integrations/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(
    id: string,
    data: {
      isActive?: boolean;
      isPrimary?: boolean;
      settings?: Record<string, unknown>;
      credentials?: Record<string, string>;
      description?: string;
    },
  ) {
    return fetchApi<IntegrationProviderConfig>(`/api/integrations/providers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async test(id: string) {
    return fetchApi<{
      success: boolean;
      message: string;
      checkedAt: string;
      details?: Record<string, unknown>;
    }>(`/api/integrations/providers/${id}/test`, {
      method: 'POST',
    });
  },
};

// Licenses API
export const licensesApi = {
  async list(tenantId?: string) {
    const query = tenantId ? `?tenantId=${tenantId}` : '';
    return fetchApi<License[]>(`/api/licenses${query}`);
  },

  async get(id: string) {
    return fetchApi<License>(`/api/licenses/${id}`);
  },

  async create(data: {
    tenantId: string;
    type: string;
    validFrom: string;
    validUntil: string;
    features?: Partial<LicenseFeatures>;
  }) {
    return fetchApi<License>('/api/licenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<License>) {
    return fetchApi<License>(`/api/licenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async revoke(id: string) {
    return fetchApi<License>(`/api/licenses/${id}/revoke`, { method: 'POST' });
  },

  async listRuntimeDecisions(
    tenantId: string,
    filters?: {
      limit?: number;
      resourceType?: string;
      decisionType?: 'entitlement_check' | 'quota_check' | 'quota_consume';
    },
  ) {
    const params = new URLSearchParams();
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.resourceType) params.set('resourceType', filters.resourceType);
    if (filters?.decisionType) params.set('decisionType', filters.decisionType);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<LicenseRuntimeDecision[]>(
      `/api/licenses/${tenantId}/runtime-decisions${query}`,
    );
  },
};

// Users API
export const usersApi = {
  async list(clientId?: string) {
    const query = clientId ? `?clientId=${clientId}` : '';
    return fetchApi<User[]>(`/api/users${query}`);
  },

  async get(id: string) {
    return fetchApi<User>(`/api/users/${id}`);
  },

  async create(data: {
    email: string;
    password?: string;
    firstName: string;
    lastName: string;
    role: string;
    clientId?: string;
    roleIds?: string[];
  }) {
    return fetchApi<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<User>) {
    return fetchApi<User>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchApi<void>(`/api/users/${id}`, { method: 'DELETE' });
  },

  async activate(id: string) {
    return fetchApi<User>(`/api/users/${id}/activate`, { method: 'POST' });
  },

  async suspend(id: string) {
    return fetchApi<User>(`/api/users/${id}/suspend`, { method: 'POST' });
  },
};

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

// ============================================================================
// BILLING API
// ============================================================================

export interface TenantSubscription {
  id: string;
  tenantId: string;
  tenantName: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paymentMethodType: 'ach_debit' | 'sepa_debit' | 'card' | 'invoice';
  stripePaymentMethodId: string | null;
  bankName: string | null;
  bankAccountLast4: string | null;
  bankAccountType: string | null;
  status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'unpaid';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  failedPaymentAttempts: number;
  lastPaymentAttempt: string | null;
  lastPaymentError: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  gracePeriodDays: number;
  gracePeriodEnds: string | null;
  monthlyAmount: number | null;
  currency: string;
  botsCanRun: boolean;
  botsDisabledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentHistory {
  id: string;
  tenantId: string;
  subscriptionId: string;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  amount: number;
  currency: string;
  paymentMethod: 'ach_debit' | 'sepa_debit' | 'card' | 'invoice';
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
  expectedClearDate: string | null;
  clearedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  invoicePeriod: string | null;
  createdAt: string;
}

export interface UsageMetric {
  metric: string;
  quantity: number;
  amount?: number;
}

export interface UsageSummary {
  period: string;
  metrics: Record<string, { quantity: number; amount?: number }>;
  totalAmount?: number;
}

export interface RevenueShare {
  id: string;
  partnerId: string;
  period: string;
  grossRevenue: number;
  netRevenue?: number;
  skuldCommission: number;
  partnerPayout: number;
  commissionRate: number;
  status: 'calculated' | 'approved' | 'transferred' | 'paid' | 'failed';
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
}

export const billingApi = {
  // Subscriptions
  async listSubscriptions(filters?: { status?: string; search?: string }) {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<TenantSubscription[]>(`/api/subscriptions${query}`);
  },

  async getSubscription(tenantId: string) {
    return fetchApi<TenantSubscription | { exists: false }>(`/api/subscriptions/${tenantId}`);
  },

  async createSubscription(data: { tenantId: string; tenantName: string; trialDays?: number }) {
    return fetchApi<TenantSubscription>('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async setupACH(
    tenantId: string,
    data: {
      accountHolderName: string;
      accountHolderType: 'individual' | 'company';
      routingNumber: string;
      accountNumber: string;
      accountType: 'checking' | 'savings';
    },
  ) {
    return fetchApi<TenantSubscription>(`/api/subscriptions/${tenantId}/setup-ach`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async canBotsRun(tenantId: string) {
    return fetchApi<{
      canRun: boolean;
      reason?: string;
      status: string;
      gracePeriodEnds?: string;
    }>(`/api/subscriptions/${tenantId}/can-run`);
  },

  async getPaymentHistory(tenantId: string, limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return fetchApi<PaymentHistory[]>(`/api/subscriptions/${tenantId}/payments${query}`);
  },

  async reactivateSubscription(tenantId: string, reactivatedBy: string) {
    return fetchApi<TenantSubscription>(`/api/subscriptions/${tenantId}/reactivate`, {
      method: 'POST',
      body: JSON.stringify({ reactivatedBy }),
    });
  },

  // Usage
  async getTenantUsage(tenantId: string, period?: string) {
    const query = period ? `?period=${period}` : '';
    return fetchApi<UsageSummary>(`/api/billing/usage/tenant/${tenantId}${query}`);
  },

  // Revenue Share
  async getPartnerRevenueShare(partnerId: string, startPeriod?: string, endPeriod?: string) {
    const params = new URLSearchParams();
    if (startPeriod) params.append('startPeriod', startPeriod);
    if (endPeriod) params.append('endPeriod', endPeriod);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<RevenueShare[]>(`/api/billing/revenue-share/partner/${partnerId}${query}`);
  },

  async calculateRevenueShare(partnerId: string, period: string) {
    return fetchApi<RevenueShare>('/api/billing/revenue-share/calculate', {
      method: 'POST',
      body: JSON.stringify({ partnerId, period }),
    });
  },

  async approveRevenueShare(id: string, approvedBy: string) {
    return fetchApi<RevenueShare>(`/api/billing/revenue-share/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approvedBy }),
    });
  },

  // Payouts
  async createPayout(partnerId: string) {
    return fetchApi<{ stripeTransferId?: string; amount?: number; message?: string }>(
      `/api/billing/payouts/partner/${partnerId}`,
      { method: 'POST' },
    );
  },

  async getPartnerPayouts(partnerId: string) {
    return fetchApi<
      Array<{
        id: string;
        amount: number;
        status: string;
        createdAt: string;
      }>
    >(`/api/billing/payouts/partner/${partnerId}`);
  },
};

// ============================================================================
// MARKETPLACE API
// ============================================================================

export interface MarketplaceBot {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  category: string;
  tags: string[];
  executionMode: 'cloud' | 'runner' | 'hybrid';
  publisher: {
    id: string;
    type: 'skuld' | 'partner';
    name: string;
    verified: boolean;
    email?: string;
  };
  status: 'draft' | 'pending_review' | 'approved' | 'published' | 'deprecated' | 'rejected';
  currentVersion: string;
  icon?: string;
  screenshots?: string[];
  submittedAt?: string;
  requirements?: {
    connections?: string[];
    vaultSecrets?: string[];
    permissions?: string[];
    minEngineVersion?: string;
  };
  pricing: {
    model: 'free' | 'subscription' | 'usage' | 'hybrid';
    monthlyBase?: number;
    usageMetrics?: Array<{
      metric: string;
      pricePerUnit: number;
      description: string;
    }>;
    minimumMonthly?: number;
    trialDays?: number;
  };
  pricingModel?: 'free' | 'subscription' | 'usage' | 'hybrid';
  installs?: number;
  rating?: number;
  reviews?: number;
  stats?: {
    installs: number;
    rating: number;
    reviews: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Partner {
  id: string;
  name: string;
  email: string;
  company: string;
  website?: string;
  status: 'pending' | 'approved' | 'suspended' | 'terminated';
  approvedAt?: string;
  approvedBy?: string;
  stripeConnectAccountId?: string;
  revenueShareTier: 'starter' | 'established' | 'premier';
  lifetimeRevenue: number;
  lifetimePayouts?: number;
  pendingPayout?: number;
  totalBots: number;
  publishedBots?: number;
  totalInstalls: number;
  verified?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMarketplaceBotRequest {
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  category: string;
  tags?: string[];
  executionMode: 'cloud' | 'runner' | 'hybrid';
  publisherId: string;
  pricing: MarketplaceBot['pricing'];
  requirements?: MarketplaceBot['requirements'];
}

export interface CreatePartnerRequest {
  name: string;
  email: string;
  company: string;
  website?: string;
  description?: string;
  contactName?: string;
  contactPhone?: string;
}

export const marketplaceApi = {
  // Bots
  async listBots(filters?: { category?: string; status?: string }) {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.status) params.append('status', filters.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<MarketplaceBot[]>(`/api/marketplace/bots${query}`);
  },

  async getBot(id: string) {
    return fetchApi<MarketplaceBot>(`/api/marketplace/bots/${id}`);
  },

  async createBot(data: CreateMarketplaceBotRequest) {
    return fetchApi<MarketplaceBot>('/api/marketplace/bots', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateBot(id: string, data: Partial<MarketplaceBot>) {
    return fetchApi<MarketplaceBot>(`/api/marketplace/bots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async submitForReview(id: string) {
    return fetchApi<MarketplaceBot>(`/api/marketplace/bots/${id}/submit`, { method: 'POST' });
  },

  async approveBot(id: string, approvedBy = 'control-plane-ui') {
    return fetchApi<MarketplaceBot>(`/api/marketplace/bots/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approvedBy }),
    });
  },

  async rejectBot(id: string, reason: string, rejectedBy = 'control-plane-ui') {
    return fetchApi<MarketplaceBot>(`/api/marketplace/bots/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, rejectedBy }),
    });
  },

  async publishBot(id: string) {
    return fetchApi<MarketplaceBot>(`/api/marketplace/bots/${id}/publish`, { method: 'POST' });
  },

  // Partners
  async listPartners(status?: string) {
    void status;
    // TODO(S4): re-enable marketplace partners API calls when partner workflows are shipped.
    return [] as Partner[];
  },

  async getPartner(id: string) {
    void id;
    // TODO(S4): re-enable marketplace partners API calls when partner workflows are shipped.
    throw new Error('Partners API is disabled until Sprint 4');
  },

  async createPartner(data: CreatePartnerRequest) {
    void data;
    // TODO(S4): re-enable marketplace partners API calls when partner workflows are shipped.
    throw new Error('Partners API is disabled until Sprint 4');
  },

  async approvePartner(id: string) {
    void id;
    // TODO(S4): re-enable marketplace partners API calls when partner workflows are shipped.
    throw new Error('Partners API is disabled until Sprint 4');
  },

  // Submissions (pending review)
  async getSubmissions() {
    return fetchApi<MarketplaceBot[]>('/api/marketplace/submissions');
  },

  // Analytics
  async getAnalytics(): Promise<{
    totalBots: number;
    totalPartners: number;
    totalInstalls: number;
    monthlyRevenue: number;
    topBots: Array<{ id: string; name: string; installs: number; revenue: number }>;
  }> {
    // TODO(S4): re-enable marketplace analytics API when partner analytics backend ships.
    return {
      totalBots: 0,
      totalPartners: 0,
      totalInstalls: 0,
      monthlyRevenue: 0,
      topBots: [],
    };
  },
};

// ============================================================================
// MCP API
// ============================================================================

export interface MCPBotUsage {
  tenantId: string;
  botId: string;
  period: string;
  usage: {
    metrics: Record<string, number>;
    costs: {
      usageBased: number;
      callBased: number;
      monthlyMinimum: number;
      charged: number;
    };
  };
  projectedMonthly: number;
  minimumCommitment: number;
  willBeBilled: number;
  message?: string;
}

export interface MCPTenantUsageSummary {
  tenantId: string;
  period: string;
  botUsage: MCPBotUsage[];
  totalBotCost: number;
  summary: {
    totalBots: number;
    totalClaimsCompleted: number;
    totalApiCalls: number;
  };
}

export interface MCPActiveRunnersSummary {
  tenantId: string;
  activeRunners: Array<{
    tenantId: string;
    runnerId: string;
    type: 'attended' | 'unattended';
    status: 'active' | 'idle' | 'error';
    timestamp: string;
    orchestratorId?: string | null;
  }>;
  totalActive: number;
  attended: number;
  unattended: number;
}

export interface MCPMarketplaceSubscription {
  subscriptionId: string;
  botId: string;
  botName: string | null;
  botSlug: string | null;
  pricingPlan: 'usage' | 'per_call' | 'monthly' | 'hybrid';
  status: 'active' | 'canceled';
  subscribedAt: string | null;
  downloadCount: number;
}

type MCPToolResponse<T> = {
  success: boolean;
  result?: T;
  error?: string;
};

async function callMcpTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetchApi<MCPToolResponse<T>>('/api/v1/mcp/tools/call', {
    method: 'POST',
    body: JSON.stringify({
      name,
      arguments: args,
    }),
  });

  if (!response.success || response.result === undefined) {
    throw new Error(response.error || `MCP tool failed: ${name}`);
  }

  return response.result;
}

export const mcpApi = {
  async getTenantUsageSummary(tenantId: string, period?: string) {
    return callMcpTool<MCPTenantUsageSummary>('get_tenant_usage_summary', {
      tenantId,
      ...(period ? { period } : {}),
    });
  },

  async getActiveRunners(tenantId: string) {
    return callMcpTool<MCPActiveRunnersSummary>('get_active_runners', {
      tenantId,
    });
  },

  async listSubscribedBots(tenantId: string) {
    const result = await callMcpTool<{ subscriptions: MCPMarketplaceSubscription[] }>(
      'list_subscribed_bots',
      { tenantId },
    );
    return result.subscriptions;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACTS API
// ═══════════════════════════════════════════════════════════════════════════

export type ContractStatus = 'draft' | 'active' | 'deprecated' | 'archived';

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  msa: 'Master Service Agreement',
  tos: 'Terms of Service',
  sla: 'Service Level Agreement',
  aup: 'Acceptable Use Policy',
  dpa: 'Data Processing Agreement',
  privacy: 'Privacy Policy',
  baa: 'Business Associate Agreement',
  pci_addendum: 'PCI-DSS Addendum',
  soc2: 'SOC2 Attestation',
  nda: 'Non-Disclosure Agreement',
  eula: 'Software License Agreement (EULA)',
  custom: 'Custom Agreement',
};

export interface ContractTypeLookupItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  contractLevel: string;
  contractScope: string;
  productScopes?: string[] | null;
}

export interface ContractLookupItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ContractMetadataLookupsResponse {
  contractTypes: ContractTypeLookupItem[];
  jurisdictions: ContractLookupItem[];
  complianceFrameworks: ContractLookupItem[];
}

export interface ContractGroupSummary {
  id: string;
  name: string;
  displayName: string;
  contractType: string;
  summary: string | null;
  isRequired: boolean;
  requiresSignature: boolean;
  requiresCountersignature: boolean;
  legalJurisdiction: string | null;
  complianceFrameworks: string[] | null;
  requiredForPlans: string[] | null;
  requiredForAddons: string[] | null;
  requiredForVerticals: string[] | null;
  totalVersions: number;
  activeVersion: {
    id: string;
    version: string;
    effectiveDate: string | null;
    pdfUrl: string | null;
    hasPdf: boolean;
  } | null;
  draftVersion: { id: string; version: string; createdAt: string | null } | null;
  latestVersion: { id: string; version: string; status: ContractStatus } | null;
}

export interface ContractAcceptance {
  id: string;
  templateId: string | null;
  clientId: string;
  acceptedAt: string;
  acceptanceMethod: string;
  acceptedByName: string;
  acceptedByEmail: string;
  acceptedByTitle: string | null;
  ipAddress: string;
  countersignedAt: string | null;
  countersignedBy: string | null;
  contentSnapshotHash: string;
  effectiveDate: string;
  expirationDate: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  createdAt: string;
  signedPdfUrl: string | null;
  skuldSignatoryName?: string;
  skuldResolutionSource?: string;
  template?: { id: string; displayName: string; version: string } | null;
}

export const contractsApi = {
  // Grouped view
  listContractsGrouped: (params?: { contractType?: string; includeArchived?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.contractType) sp.append('contractType', params.contractType);
    if (params?.includeArchived) sp.append('includeArchived', 'true');
    const q = sp.toString();
    return fetchApi<{ contracts: ContractGroupSummary[]; total: number }>(
      `/api/contracts/grouped${q ? `?${q}` : ''}`,
    );
  },

  // Acceptances
  listAcceptances: (params?: { clientId?: string; tenantId?: string; contractId?: string }) => {
    const sp = new URLSearchParams();
    if (params?.clientId) sp.append('clientId', params.clientId);
    if (params?.tenantId) sp.append('tenantId', params.tenantId);
    if (params?.contractId) sp.append('contractId', params.contractId);
    const q = sp.toString();
    return fetchApi<ContractAcceptance[]>(`/api/contracts/acceptances${q ? `?${q}` : ''}`);
  },

  // Metadata lookups
  getMetadataLookups: (includeInactive = false) =>
    fetchApi<ContractMetadataLookupsResponse>(
      `/api/contracts/lookups${includeInactive ? '?includeInactive=true' : ''}`,
    ),

  // Templates
  listTemplates: (params?: {
    contractType?: string;
    status?: ContractStatus;
    includeArchived?: boolean;
  }) => {
    const sp = new URLSearchParams();
    if (params?.contractType) sp.append('contractType', params.contractType);
    if (params?.status) sp.append('status', params.status);
    if (params?.includeArchived) sp.append('includeArchived', 'true');
    const q = sp.toString();
    return fetchApi<{ templates: unknown[]; total: number }>(
      `/api/contracts/templates${q ? `?${q}` : ''}`,
    );
  },

  getTemplate: (templateId: string) => fetchApi<unknown>(`/api/contracts/templates/${templateId}`),

  createTemplate: (data: Record<string, unknown>) =>
    fetchApi<unknown>('/api/contracts/templates', { method: 'POST', body: JSON.stringify(data) }),

  publishTemplate: (templateId: string) =>
    fetchApi<unknown>(`/api/contracts/templates/${templateId}/publish`, { method: 'POST' }),

  deprecateTemplate: (templateId: string) =>
    fetchApi<unknown>(`/api/contracts/templates/${templateId}/deprecate`, { method: 'POST' }),

  archiveTemplate: (templateId: string) =>
    fetchApi<unknown>(`/api/contracts/templates/${templateId}`, { method: 'DELETE' }),

  // Contract versions
  listContractVersions: (contractName: string, params?: { includeArchived?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.includeArchived) sp.append('includeArchived', 'true');
    const q = sp.toString();
    return fetchApi<unknown>(`/api/contracts/by-name/${contractName}/versions${q ? `?${q}` : ''}`);
  },

  // Signatories
  listContractSignatories: (activeOnly = true) =>
    fetchApi<unknown[]>(
      `/api/contracts/signatories${activeOnly ? '?activeOnly=true' : '?activeOnly=false'}`,
    ),

  // Signatory policies
  listSignatoryPolicies: (params?: { contractType?: string }) => {
    const sp = new URLSearchParams();
    if (params?.contractType) sp.append('contractType', params.contractType);
    const q = sp.toString();
    return fetchApi<{ policies: unknown[]; total: number }>(
      `/api/contracts/signatory-policies${q ? `?${q}` : ''}`,
    );
  },

  // Validation
  getClientContractStatus: (clientId: string) =>
    fetchApi<unknown>(`/api/contracts/client/${clientId}/status`),
};
