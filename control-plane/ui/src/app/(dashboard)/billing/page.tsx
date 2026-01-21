'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  ChevronRight,
  Ban,
} from 'lucide-react';

// Mock data
const mockSubscriptions = [
  {
    id: '1',
    tenantId: 'tenant-1',
    tenantName: 'Acme Corp Production',
    status: 'active',
    paymentMethodType: 'ach_debit',
    bankName: 'Chase',
    bankAccountLast4: '4242',
    monthlyAmount: 4500,
    currentPeriodEnd: '2025-02-15',
    botsCanRun: true,
  },
  {
    id: '2',
    tenantId: 'tenant-2',
    tenantName: 'TechStart Staging',
    status: 'trialing',
    paymentMethodType: 'ach_debit',
    bankName: null,
    bankAccountLast4: null,
    monthlyAmount: 0,
    trialEnd: '2025-02-01',
    botsCanRun: true,
  },
  {
    id: '3',
    tenantId: 'tenant-3',
    tenantName: 'Global Services QA',
    status: 'past_due',
    paymentMethodType: 'ach_debit',
    bankName: 'Bank of America',
    bankAccountLast4: '1234',
    monthlyAmount: 2500,
    failedPaymentAttempts: 2,
    gracePeriodEnds: '2025-01-25',
    botsCanRun: true,
  },
  {
    id: '4',
    tenantId: 'tenant-4',
    tenantName: 'DataFlow Production',
    status: 'suspended',
    paymentMethodType: 'ach_debit',
    bankName: 'Wells Fargo',
    bankAccountLast4: '5678',
    monthlyAmount: 3200,
    suspendedAt: '2025-01-10',
    suspensionReason: 'Non-payment after grace period',
    botsCanRun: false,
  },
];

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  active: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Active' },
  trialing: { color: 'text-blue-700', bgColor: 'bg-blue-50', icon: Clock, label: 'Trial' },
  past_due: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: AlertTriangle, label: 'Past Due' },
  suspended: { color: 'text-red-700', bgColor: 'bg-red-50', icon: Ban, label: 'Suspended' },
  canceled: { color: 'text-zinc-600', bgColor: 'bg-zinc-100', icon: XCircle, label: 'Canceled' },
};

export default function BillingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredSubscriptions = mockSubscriptions.filter((sub) => {
    const matchesSearch = sub.tenantName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalMRR = mockSubscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + (s.monthlyAmount || 0), 0);
  const activeCount = mockSubscriptions.filter((s) => s.status === 'active').length;
  const trialCount = mockSubscriptions.filter((s) => s.status === 'trialing').length;
  const atRiskCount = mockSubscriptions.filter((s) => ['past_due', 'suspended'].includes(s.status)).length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Billing</h1>
          <p className="text-zinc-500 mt-1">Manage subscriptions and payments</p>
        </div>
        <Link
          href="/billing/revenue-share"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
        >
          <TrendingUp className="h-4 w-4" />
          Revenue Share
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Monthly Revenue"
          value={`$${totalMRR.toLocaleString()}`}
          icon={DollarSign}
          color="emerald"
        />
        <StatCard label="Active" value={activeCount} icon={CheckCircle2} color="emerald" />
        <StatCard label="Trials" value={trialCount} icon={Clock} color="blue" />
        <StatCard
          label="At Risk"
          value={atRiskCount}
          icon={AlertTriangle}
          color="amber"
          highlight={atRiskCount > 0}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search subscriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trial</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Subscriptions List */}
      <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
        {/* Table Header - Desktop */}
        <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 border-b border-zinc-100 bg-zinc-50/50 text-xs font-medium text-zinc-500 uppercase tracking-wide">
          <div className="col-span-4">Tenant</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Payment</div>
          <div className="col-span-2">Amount</div>
          <div className="col-span-2 text-right">Next Billing</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-zinc-100">
          {filteredSubscriptions.map((sub) => {
            const status = statusConfig[sub.status] || statusConfig.active;
            const StatusIcon = status.icon;

            return (
              <Link
                key={sub.id}
                href={`/billing/subscriptions/${sub.tenantId}`}
                className="block hover:bg-zinc-50 transition-colors"
              >
                {/* Desktop Row */}
                <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-4 items-center">
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-4 w-4 text-zinc-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 truncate">{sub.tenantName}</p>
                      <p className="text-sm text-zinc-500 truncate">{sub.tenantId}</p>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                    {sub.status === 'past_due' && sub.gracePeriodEnds && (
                      <p className="text-xs text-amber-600 mt-1">
                        Grace until {new Date(sub.gracePeriodEnds).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2">
                    {sub.bankName ? (
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm text-zinc-600">
                          ****{sub.bankAccountLast4}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-400">Not set</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm font-medium text-zinc-900">
                      ${sub.monthlyAmount?.toLocaleString() || '0'}/mo
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <span className="text-sm text-zinc-500">
                      {sub.status === 'trialing' && sub.trialEnd
                        ? `Trial ends ${new Date(sub.trialEnd).toLocaleDateString()}`
                        : sub.currentPeriodEnd
                        ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                        : '—'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-300" />
                  </div>
                </div>

                {/* Mobile Card */}
                <div className="lg:hidden p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-zinc-500" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900">{sub.tenantName}</p>
                        <p className="text-sm text-zinc-500">{sub.tenantId}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-300 flex-shrink-0" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                    <span className="text-sm font-semibold text-zinc-900">
                      ${sub.monthlyAmount?.toLocaleString() || '0'}/mo
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredSubscriptions.length === 0 && (
          <div className="px-5 py-12 text-center">
            <CreditCard className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-900">No subscriptions found</p>
            <p className="text-sm text-zinc-500 mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  highlight = false,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: 'emerald' | 'blue' | 'amber';
  highlight?: boolean;
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-amber-200 bg-amber-50/30' : 'border-zinc-200/80 bg-white'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-8 w-8 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={`text-2xl font-semibold ${highlight ? 'text-amber-700' : 'text-zinc-900'}`}>{value}</p>
      <p className="text-sm text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}
