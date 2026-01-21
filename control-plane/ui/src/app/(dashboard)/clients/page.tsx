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
  Building2,
  Plus,
  Search,
  Server,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  MoreHorizontal,
} from 'lucide-react';

// Mock data
const mockClients = [
  {
    id: '1',
    name: 'Acme Corporation',
    slug: 'acme-corp',
    plan: 'enterprise',
    status: 'active',
    billingEmail: 'billing@acme.com',
    tenantsCount: 5,
    createdAt: '2024-01-15',
    monthlyRevenue: 12500,
  },
  {
    id: '2',
    name: 'TechStart Inc',
    slug: 'techstart',
    plan: 'professional',
    status: 'active',
    billingEmail: 'admin@techstart.io',
    tenantsCount: 3,
    createdAt: '2024-02-20',
    monthlyRevenue: 4500,
  },
  {
    id: '3',
    name: 'Global Services Ltd',
    slug: 'global-services',
    plan: 'starter',
    status: 'pending',
    billingEmail: 'it@globalservices.com',
    tenantsCount: 1,
    createdAt: '2024-03-01',
    monthlyRevenue: 0,
  },
  {
    id: '4',
    name: 'DataFlow Analytics',
    slug: 'dataflow',
    plan: 'professional',
    status: 'suspended',
    billingEmail: 'support@dataflow.ai',
    tenantsCount: 2,
    createdAt: '2024-01-28',
    monthlyRevenue: 0,
  },
  {
    id: '5',
    name: 'Insurance Partners Inc',
    slug: 'insurance-partners',
    plan: 'enterprise',
    status: 'active',
    billingEmail: 'finance@insurancepartners.com',
    tenantsCount: 8,
    createdAt: '2023-11-10',
    monthlyRevenue: 18000,
  },
  {
    id: '6',
    name: 'FinTech Solutions',
    slug: 'fintech-solutions',
    plan: 'professional',
    status: 'active',
    billingEmail: 'admin@fintechsolutions.io',
    tenantsCount: 4,
    createdAt: '2024-04-15',
    monthlyRevenue: 6200,
  },
];

const planConfig: Record<string, { bg: string; text: string; label: string }> = {
  free: { bg: 'bg-zinc-100', text: 'text-zinc-600', label: 'Free' },
  starter: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Starter' },
  professional: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Professional' },
  enterprise: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Enterprise' },
};

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  active: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Active' },
  pending: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock, label: 'Pending' },
  suspended: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Suspended' },
  canceled: { color: 'text-zinc-500', bgColor: 'bg-zinc-100', icon: XCircle, label: 'Canceled' },
};

export default function ClientsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredClients = mockClients.filter((client) => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.billingEmail.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = mockClients.filter((c) => c.status === 'active').length;
  const pendingCount = mockClients.filter((c) => c.status === 'pending').length;
  const totalRevenue = mockClients.reduce((sum, c) => sum + c.monthlyRevenue, 0);
  const totalOrchestrators = mockClients.reduce((sum, c) => sum + c.tenantsCount, 0);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Clients</h1>
          <p className="text-zinc-500 mt-1">Manage your client accounts</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Client
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Clients" value={activeCount} icon={Building2} color="emerald" />
        <StatCard label="Pending" value={pendingCount} icon={Clock} color="amber" highlight={pendingCount > 0} />
        <StatCard label="Orchestrators" value={totalOrchestrators} icon={Server} color="blue" />
        <StatCard label="Monthly Revenue" value={`$${(totalRevenue / 1000).toFixed(0)}k`} icon={Building2} color="emerald" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.map((client) => {
          const status = statusConfig[client.status];
          const StatusIcon = status.icon;
          const plan = planConfig[client.plan];

          return (
            <div
              key={client.id}
              className="bg-white rounded-xl border border-zinc-200/80 p-5 hover:border-zinc-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-zinc-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-zinc-900 truncate">{client.name}</h3>
                    <p className="text-sm text-zinc-500">{client.slug}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${status.bgColor} ${status.color}`}>
                  <StatusIcon className="h-3 w-3" />
                  {status.label}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${plan.bg} ${plan.text}`}>
                  {plan.label}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm text-zinc-500 mb-4">
                <div className="flex items-center gap-1.5">
                  <Server className="h-4 w-4 text-zinc-400" />
                  <span>{client.tenantsCount} orchestrators</span>
                </div>
                <span>Since {new Date(client.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
              </div>

              {client.monthlyRevenue > 0 && (
                <div className="mb-4 p-2.5 rounded-lg bg-emerald-50">
                  <p className="text-xs text-emerald-600 mb-0.5">Monthly Revenue</p>
                  <p className="text-lg font-semibold text-emerald-700">${client.monthlyRevenue.toLocaleString()}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
                <Link
                  href={`/clients/${client.id}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                >
                  View details
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <Link
                  href={`/tenants?clientId=${client.id}`}
                  className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
                >
                  Orchestrators
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredClients.length === 0 && (
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <Building2 className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-900">No clients found</p>
          <p className="text-sm text-zinc-500 mt-1">Try adjusting your search or create a new client.</p>
        </div>
      )}
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
