'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Server,
  Key,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  ArrowRight,
  Activity,
  ChevronRight,
  BarChart3,
  Zap,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  billingApi,
  clientsApi,
  licensesApi,
  marketplaceApi,
  tenantsApi,
  type Client,
  type License,
  type MarketplaceBot,
  type Partner,
  type Tenant,
  type TenantSubscription,
} from '@/lib/api';

type AlertType = 'suspended' | 'past_due' | 'trial' | 'info';

type DashboardAlert = {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  href: string;
};

type DashboardActivity = {
  id: string;
  action: string;
  subject: string;
  time: string;
  timestamp: number;
};

type PendingAction = {
  label: string;
  count: number;
  href: string;
};

type TopClient = {
  name: string;
  revenue: number;
  meta: string;
};

type ModuleStatus = 'operational' | 'degraded' | 'down';

const DEFAULT_STATS = {
  totalClients: 0,
  activeOrchestrators: 0,
  activeLicenses: 0,
  monthlyRevenue: 0,
  revenueGrowth: null as number | null,
};

function formatCurrencyShort(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'recently';
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function getMonthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${value.getUTCMonth()}`;
}

function safeDate(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [recentActivity, setRecentActivity] = useState<DashboardActivity[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [moduleStatus, setModuleStatus] = useState<{
    api: ModuleStatus;
    billing: ModuleStatus;
    marketplace: ModuleStatus;
  }>({
    api: 'operational',
    billing: 'operational',
    marketplace: 'operational',
  });

  const loadDashboard = useCallback(async () => {
    const [
      clientsResult,
      tenantsResult,
      licensesResult,
      subscriptionsResult,
      botsResult,
      partnersResult,
    ] = await Promise.allSettled([
      clientsApi.list(),
      tenantsApi.list(),
      licensesApi.list(),
      billingApi.listSubscriptions(),
      marketplaceApi.listBots(),
      marketplaceApi.listPartners(),
    ]);

    const errors: string[] = [];

    const clients =
      clientsResult.status === 'fulfilled'
        ? clientsResult.value
        : ((errors.push('clients'), []) as Client[]);
    const tenants =
      tenantsResult.status === 'fulfilled'
        ? tenantsResult.value
        : ((errors.push('tenants'), []) as Tenant[]);
    const licenses =
      licensesResult.status === 'fulfilled'
        ? licensesResult.value
        : ((errors.push('licenses'), []) as License[]);
    const subscriptions =
      subscriptionsResult.status === 'fulfilled'
        ? subscriptionsResult.value
        : ((errors.push('billing'), []) as TenantSubscription[]);
    const bots =
      botsResult.status === 'fulfilled'
        ? botsResult.value
        : ((errors.push('marketplace bots'), []) as MarketplaceBot[]);
    const partners =
      partnersResult.status === 'fulfilled'
        ? partnersResult.value
        : ((errors.push('marketplace partners'), []) as Partner[]);

    const tenantById = new Map<string, Tenant>(tenants.map((tenant) => [tenant.id, tenant]));

    const monthlyRevenue = subscriptions.reduce((sum, subscription) => {
      return sum + (subscription.monthlyAmount || 0);
    }, 0);

    const now = new Date();
    const currentMonth = getMonthKey(now);
    const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousMonth = getMonthKey(previousMonthDate);

    let currentMonthAdded = 0;
    let previousMonthAdded = 0;
    for (const subscription of subscriptions) {
      const createdAt = new Date(subscription.createdAt);
      if (Number.isNaN(createdAt.getTime())) continue;
      const key = getMonthKey(createdAt);
      if (key === currentMonth) {
        currentMonthAdded += subscription.monthlyAmount || 0;
      } else if (key === previousMonth) {
        previousMonthAdded += subscription.monthlyAmount || 0;
      }
    }

    const revenueGrowth =
      previousMonthAdded > 0
        ? ((currentMonthAdded - previousMonthAdded) / previousMonthAdded) * 100
        : null;

    setStats({
      totalClients: clients.length,
      activeOrchestrators: tenants.filter((tenant) => tenant.status === 'active').length,
      activeLicenses: licenses.filter((license) => license.status === 'active' && license.isValid)
        .length,
      monthlyRevenue,
      revenueGrowth,
    });

    const nowTs = Date.now();
    const billingAlerts = subscriptions
      .map((subscription) => {
        const tenant = tenantById.get(subscription.tenantId);
        const tenantTitle = tenant?.name || subscription.tenantName || subscription.tenantId;

        if (subscription.status === 'suspended') {
          return {
            id: `s-${subscription.tenantId}`,
            type: 'suspended' as AlertType,
            title: tenantTitle,
            description: subscription.suspensionReason
              ? `Subscription suspended: ${subscription.suspensionReason}`
              : 'Subscription suspended',
            href: `/billing/subscriptions/${subscription.tenantId}`,
            severity: 3,
            timestamp: safeDate(subscription.updatedAt),
          };
        }

        if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
          const graceEnd = subscription.gracePeriodEnds
            ? formatRelativeTime(subscription.gracePeriodEnds)
            : 'soon';
          return {
            id: `pd-${subscription.tenantId}`,
            type: 'past_due' as AlertType,
            title: tenantTitle,
            description: `Payment issue detected. Grace period ends ${graceEnd}.`,
            href: `/billing/subscriptions/${subscription.tenantId}`,
            severity: 2,
            timestamp: safeDate(subscription.updatedAt),
          };
        }

        if (subscription.status === 'trialing' && subscription.trialEnd) {
          const trialEndTs = safeDate(subscription.trialEnd);
          const remainingDays = Math.ceil((trialEndTs - nowTs) / (24 * 60 * 60 * 1000));
          if (remainingDays <= 7) {
            return {
              id: `t-${subscription.tenantId}`,
              type: 'trial' as AlertType,
              title: tenantTitle,
              description: `Trial expires in ${Math.max(remainingDays, 0)} day(s).`,
              href: `/billing/subscriptions/${subscription.tenantId}`,
              severity: 1,
              timestamp: trialEndTs,
            };
          }
        }

        return null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.severity - a.severity || b.timestamp - a.timestamp)
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        href: item.href,
      }));

    setAlerts(billingAlerts);

    const activityEvents: DashboardActivity[] = [];

    for (const client of clients) {
      activityEvents.push({
        id: `client-${client.id}`,
        action: 'New client created',
        subject: client.name,
        time: formatRelativeTime(client.createdAt),
        timestamp: safeDate(client.createdAt),
      });
    }

    for (const tenant of tenants) {
      activityEvents.push({
        id: `tenant-${tenant.id}`,
        action: 'Orchestrator registered',
        subject: `${tenant.name} (${tenant.environment})`,
        time: formatRelativeTime(tenant.createdAt),
        timestamp: safeDate(tenant.createdAt),
      });
    }

    for (const license of licenses) {
      const tenant = tenantById.get(license.tenantId);
      activityEvents.push({
        id: `license-${license.id}`,
        action: 'License issued',
        subject: `${tenant?.name || license.tenantId} (${license.type})`,
        time: formatRelativeTime(license.createdAt),
        timestamp: safeDate(license.createdAt),
      });
    }

    for (const bot of bots) {
      if (bot.status === 'published' || bot.status === 'pending_review') {
        activityEvents.push({
          id: `bot-${bot.id}`,
          action: bot.status === 'published' ? 'Bot published' : 'Bot submitted',
          subject: bot.name,
          time: formatRelativeTime(bot.updatedAt),
          timestamp: safeDate(bot.updatedAt),
        });
      }
    }

    setRecentActivity(activityEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8));

    setPendingActions([
      {
        label: 'Bot Submissions',
        count: bots.filter((bot) => bot.status === 'pending_review').length,
        href: '/marketplace/submissions',
      },
      {
        label: 'Partner Applications',
        count: partners.filter((partner) => partner.status === 'pending').length,
        href: '/marketplace/partners',
      },
      {
        label: 'Billing Follow-ups',
        count: subscriptions.filter((subscription) =>
          ['past_due', 'unpaid', 'suspended'].includes(subscription.status),
        ).length,
        href: '/billing',
      },
    ]);

    const tenantCountByClient = new Map<string, number>();
    for (const tenant of tenants) {
      tenantCountByClient.set(tenant.clientId, (tenantCountByClient.get(tenant.clientId) || 0) + 1);
    }

    const revenueByClient = new Map<string, number>();
    for (const subscription of subscriptions) {
      const tenant = tenantById.get(subscription.tenantId);
      if (!tenant) continue;

      const amount = subscription.monthlyAmount || 0;
      revenueByClient.set(tenant.clientId, (revenueByClient.get(tenant.clientId) || 0) + amount);
    }

    const clientsRanked = clients
      .map((client) => {
        const revenue = revenueByClient.get(client.id) || 0;
        const orchestrators = tenantCountByClient.get(client.id) || 0;
        return {
          name: client.name,
          revenue,
          meta: `${orchestrators} orchestrator${orchestrators === 1 ? '' : 's'}`,
        } satisfies TopClient;
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4);

    setTopClients(clientsRanked);

    const hasCoreErrors = errors.some((errorCode) =>
      ['clients', 'tenants', 'licenses'].includes(errorCode),
    );
    const hasBillingErrors = errors.includes('billing');
    const hasMarketplaceErrors =
      errors.includes('marketplace bots') || errors.includes('marketplace partners');

    setModuleStatus({
      api: hasCoreErrors ? 'degraded' : 'operational',
      billing: hasBillingErrors ? 'degraded' : 'operational',
      marketplace: hasMarketplaceErrors ? 'degraded' : 'operational',
    });

    if (errors.length > 0) {
      toast({
        variant: 'warning',
        title: 'Dashboard loaded with partial data',
        description: `Some modules failed to load: ${errors.join(', ')}.`,
      });
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        await loadDashboard();
      } catch (error) {
        toast({
          variant: 'error',
          title: 'Failed to load dashboard',
          description:
            error instanceof Error ? error.message : 'Unexpected error loading dashboard.',
        });
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [loadDashboard]);

  const revenueTrend = useMemo(() => {
    if (stats.revenueGrowth === null) {
      return undefined;
    }

    const rounded = Math.abs(stats.revenueGrowth).toFixed(1);
    return `${stats.revenueGrowth >= 0 ? '+' : '-'}${rounded}%`;
  }, [stats.revenueGrowth]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadDashboard();
      toast({
        variant: 'success',
        title: 'Dashboard updated',
        description: 'Live metrics were refreshed successfully.',
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Refresh failed',
        description: error instanceof Error ? error.message : 'Unable to refresh dashboard.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-zinc-500 mt-1">
            Overview of live platform metrics and operational activity
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={loading || refreshing}>
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Total Clients"
          value={loading ? '...' : stats.totalClients}
          icon={Building2}
          href="/clients"
          color="emerald"
        />
        <StatsCard
          label="Orchestrators"
          value={loading ? '...' : stats.activeOrchestrators}
          icon={Server}
          href="/tenants"
          color="blue"
        />
        <StatsCard
          label="Active Licenses"
          value={loading ? '...' : stats.activeLicenses}
          icon={Key}
          href="/licenses"
          color="violet"
        />
        <StatsCard
          label="Monthly Revenue"
          value={loading ? '...' : formatCurrencyShort(stats.monthlyRevenue)}
          icon={DollarSign}
          href="/billing"
          color="emerald"
          trend={revenueTrend}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {alerts.length > 0 && (
            <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h2 className="font-medium text-zinc-900">Attention Required</h2>
                </div>
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {alerts.length} items
                </span>
              </div>
              <div className="divide-y divide-zinc-100">
                {alerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={alert.href}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 transition-colors group"
                  >
                    <div
                      className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        alert.type === 'suspended'
                          ? 'bg-red-500'
                          : alert.type === 'past_due'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{alert.title}</p>
                      <p className="text-sm text-zinc-500 truncate">{alert.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="bg-white rounded-xl border border-zinc-200/80">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-zinc-400" />
                <h2 className="font-medium text-zinc-900">Recent Activity</h2>
              </div>
              <Link href="/clients" className="text-sm text-zinc-500 hover:text-zinc-900">
                View clients
              </Link>
            </div>
            {recentActivity.length === 0 ? (
              <div className="px-5 py-8 text-sm text-zinc-500">No recent activity available.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {recentActivity.map((item) => (
                  <div key={item.id} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center">
                      <Zap className="h-3.5 w-3.5 text-zinc-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-900">
                        <span className="text-zinc-500">{item.action}:</span>{' '}
                        <span className="font-medium">{item.subject}</span>
                      </p>
                    </div>
                    <span className="text-xs text-zinc-400 whitespace-nowrap">{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-zinc-200/80">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-zinc-400" />
                <h2 className="font-medium text-zinc-900">Top Clients by Revenue</h2>
              </div>
              <Link href="/billing" className="text-sm text-zinc-500 hover:text-zinc-900">
                View billing
              </Link>
            </div>
            <div className="p-5">
              {topClients.length === 0 ? (
                <p className="text-sm text-zinc-500">No revenue data available yet.</p>
              ) : (
                <div className="space-y-4">
                  {topClients.map((client, index) => (
                    <div key={client.name} className="flex items-center gap-4">
                      <span className="text-sm font-medium text-zinc-400 w-5">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">{client.name}</p>
                        <div className="mt-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full"
                            style={{
                              width: `${
                                topClients[0].revenue > 0
                                  ? (client.revenue / topClients[0].revenue) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-zinc-900">
                          {formatCurrencyShort(client.revenue)}
                        </p>
                        <p className="text-xs text-zinc-500">{client.meta}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border border-zinc-200/80">
            <div className="px-5 py-4 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-400" />
                <h2 className="font-medium text-zinc-900">Pending Actions</h2>
              </div>
            </div>
            <div className="p-3">
              {pendingActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 transition-colors group"
                >
                  <span className="text-sm text-zinc-700 group-hover:text-zinc-900">
                    {action.label}
                  </span>
                  <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {action.count}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-zinc-200/80">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Quick Actions</h2>
            </div>
            <div className="p-3 space-y-1">
              <QuickAction href="/clients" icon={Building2} label="New Client" />
              <QuickAction href="/tenants" icon={Server} label="New Orchestrator" />
              <QuickAction href="/licenses" icon={Key} label="Generate License" />
              <QuickAction href="/marketplace" icon={Package} label="Browse Marketplace" />
            </div>
          </section>

          <section className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-xl p-5 text-white">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <h2 className="font-medium">System Status</h2>
            </div>
            <p className="text-sm text-zinc-400 mb-4">Health across live Control Plane modules</p>
            <div className="space-y-2">
              <StatusItem label="Core API" status={moduleStatus.api} />
              <StatusItem label="Billing" status={moduleStatus.billing} />
              <StatusItem label="Marketplace" status={moduleStatus.marketplace} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatsCard({
  label,
  value,
  icon: Icon,
  href,
  color,
  trend,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  href: string;
  color: 'emerald' | 'blue' | 'violet';
  trend?: string;
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-zinc-200/80 p-4 hover:border-zinc-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`h-9 w-9 rounded-lg ${colorClasses[color]} flex items-center justify-center`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
      </div>
      <p className="text-2xl font-semibold text-zinc-900">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-sm text-zinc-500">{label}</p>
        {trend && (
          <span
            className={`text-xs font-medium ${trend.startsWith('+') ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {trend}
          </span>
        )}
      </div>
    </Link>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors group"
    >
      <Icon className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600" />
      <span>{label}</span>
    </Link>
  );
}

function StatusItem({ label, status }: { label: string; status: ModuleStatus }) {
  const labelByStatus: Record<ModuleStatus, string> = {
    operational: 'Operational',
    degraded: 'Degraded',
    down: 'Down',
  };

  const classByStatus: Record<ModuleStatus, string> = {
    operational: 'text-emerald-400',
    degraded: 'text-amber-300',
    down: 'text-red-400',
  };

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className={classByStatus[status]}>{labelByStatus[status]}</span>
    </div>
  );
}
