'use client';

import Link from 'next/link';
import {
  Building2,
  Server,
  Key,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  ArrowRight,
  Activity,
  Users,
  ChevronRight,
  BarChart3,
  Zap,
} from 'lucide-react';

// Mock data
const stats = {
  totalClients: 24,
  activeOrchestrators: 45,
  activeLicenses: 52,
  monthlyRevenue: 125000,
  revenueGrowth: 12.5,
};

const alerts = [
  {
    id: '1',
    type: 'suspended',
    title: 'DataFlow Production',
    description: 'Subscription suspended - Non-payment',
    href: '/billing/subscriptions/tenant-4',
  },
  {
    id: '2',
    type: 'past_due',
    title: 'Global Services QA',
    description: 'Payment failed - Grace period ends Jan 25',
    href: '/billing/subscriptions/tenant-3',
  },
  {
    id: '3',
    type: 'trial',
    title: 'TechStart Trial',
    description: 'Trial expires in 3 days',
    href: '/billing/subscriptions/tenant-2',
  },
];

const recentActivity = [
  { id: '1', action: 'New client created', subject: 'FinTech Solutions', time: '2 hours ago' },
  { id: '2', action: 'Payment received', subject: 'Acme Corp - $4,500', time: '4 hours ago' },
  { id: '3', action: 'Bot published', subject: 'Email Processor v2.1', time: 'Yesterday' },
  { id: '4', action: 'License expired', subject: 'DataFlow QA', time: 'Yesterday' },
];

const pendingActions = [
  { label: 'Bot Submissions', count: 3, href: '/marketplace/submissions' },
  { label: 'Partner Applications', count: 2, href: '/marketplace/partners' },
  { label: 'Revenue Share Approvals', count: 4, href: '/billing/revenue-share' },
];

const topClients = [
  { name: 'Acme Corporation', revenue: 45000, change: '+12%' },
  { name: 'Insurance Partners Inc', revenue: 32000, change: '+8%' },
  { name: 'FinTech Solutions', revenue: 28500, change: '+23%' },
  { name: 'Healthcare Systems', revenue: 24000, change: '-3%' },
];

export default function DashboardPage() {
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-zinc-500 mt-1">Overview of your platform metrics and activity</p>
      </div>

      {/* Stats Grid - Refactoring UI: Use background color for grouping, not borders */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Total Clients"
          value={stats.totalClients}
          icon={Building2}
          href="/clients"
          color="emerald"
        />
        <StatsCard
          label="Orchestrators"
          value={stats.activeOrchestrators}
          icon={Server}
          href="/tenants"
          color="blue"
        />
        <StatsCard
          label="Active Licenses"
          value={stats.activeLicenses}
          icon={Key}
          href="/licenses"
          color="violet"
        />
        <StatsCard
          label="Monthly Revenue"
          value={`$${(stats.monthlyRevenue / 1000).toFixed(0)}k`}
          icon={DollarSign}
          href="/billing"
          color="emerald"
          trend={`+${stats.revenueGrowth}%`}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Alerts Section */}
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
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      alert.type === 'suspended' ? 'bg-red-500' :
                      alert.type === 'past_due' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
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

          {/* Recent Activity */}
          <section className="bg-white rounded-xl border border-zinc-200/80">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-zinc-400" />
                <h2 className="font-medium text-zinc-900">Recent Activity</h2>
              </div>
              <Link href="/activity" className="text-sm text-zinc-500 hover:text-zinc-900">
                View all
              </Link>
            </div>
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
          </section>

          {/* Top Clients */}
          <section className="bg-white rounded-xl border border-zinc-200/80">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-zinc-400" />
                <h2 className="font-medium text-zinc-900">Top Clients by Revenue</h2>
              </div>
              <Link href="/clients" className="text-sm text-zinc-500 hover:text-zinc-900">
                View all
              </Link>
            </div>
            <div className="p-5">
              <div className="space-y-4">
                {topClients.map((client, index) => (
                  <div key={client.name} className="flex items-center gap-4">
                    <span className="text-sm font-medium text-zinc-400 w-5">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{client.name}</p>
                      <div className="mt-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full"
                          style={{ width: `${(client.revenue / topClients[0].revenue) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-900">
                        ${(client.revenue / 1000).toFixed(1)}k
                      </p>
                      <p className={`text-xs ${
                        client.change.startsWith('+') ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {client.change}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column - 1/3 width */}
        <div className="space-y-6">
          {/* Pending Actions */}
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

          {/* Quick Actions */}
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

          {/* System Status */}
          <section className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-xl p-5 text-white">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <h2 className="font-medium">System Status</h2>
            </div>
            <p className="text-sm text-zinc-400 mb-4">All systems operational</p>
            <div className="space-y-2">
              <StatusItem label="API" status="operational" />
              <StatusItem label="Database" status="operational" />
              <StatusItem label="Workers" status="operational" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Refactoring UI: Extract components for reusability and consistency
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
        <div className={`h-9 w-9 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
      </div>
      <p className="text-2xl font-semibold text-zinc-900">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-sm text-zinc-500">{label}</p>
        {trend && (
          <span className="text-xs font-medium text-emerald-600">{trend}</span>
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

function StatusItem({ label, status }: { label: string; status: 'operational' | 'degraded' | 'down' }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className={status === 'operational' ? 'text-emerald-400' : 'text-red-400'}>
        {status === 'operational' ? 'Operational' : status}
      </span>
    </div>
  );
}
