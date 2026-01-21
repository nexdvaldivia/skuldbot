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
  ArrowLeft,
  Users,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Building2,
  Package,
  Download,
  DollarSign,
  ExternalLink,
  MoreHorizontal,
} from 'lucide-react';

// Mock data
const mockPartners = [
  {
    id: 'partner-1',
    name: 'Automation Experts Inc',
    email: 'contact@automationexperts.com',
    company: 'Automation Experts Inc',
    website: 'https://automationexperts.com',
    status: 'approved',
    revenueShareTier: 'premier',
    lifetimeRevenue: 450000,
    totalBots: 8,
    totalInstalls: 234,
    createdAt: '2024-05-01',
  },
  {
    id: 'partner-2',
    name: 'RPA Solutions Ltd',
    email: 'partners@rpasolutions.io',
    company: 'RPA Solutions Ltd',
    website: 'https://rpasolutions.io',
    status: 'approved',
    revenueShareTier: 'starter',
    lifetimeRevenue: 45000,
    totalBots: 3,
    totalInstalls: 67,
    createdAt: '2024-08-01',
  },
  {
    id: 'partner-3',
    name: 'Bot Factory Co',
    email: 'biz@botfactory.co',
    company: 'Bot Factory Co',
    website: 'https://botfactory.co',
    status: 'approved',
    revenueShareTier: 'established',
    lifetimeRevenue: 280000,
    totalBots: 5,
    totalInstalls: 189,
    createdAt: '2024-03-15',
  },
  {
    id: 'partner-4',
    name: 'NewTech Automations',
    email: 'hello@newtech.dev',
    company: 'NewTech Automations LLC',
    website: 'https://newtech.dev',
    status: 'pending',
    revenueShareTier: 'starter',
    lifetimeRevenue: 0,
    totalBots: 0,
    totalInstalls: 0,
    createdAt: '2025-01-10',
  },
  {
    id: 'partner-5',
    name: 'Legacy Systems Inc',
    email: 'partners@legacysystems.com',
    company: 'Legacy Systems Inc',
    website: null,
    status: 'suspended',
    revenueShareTier: 'starter',
    lifetimeRevenue: 15000,
    totalBots: 1,
    totalInstalls: 12,
    createdAt: '2024-01-15',
  },
];

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  approved: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Approved' },
  pending: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock, label: 'Pending' },
  suspended: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Suspended' },
};

const tierConfig: Record<string, { bg: string; text: string; label: string; commission: string }> = {
  starter: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Starter', commission: '30%' },
  established: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Established', commission: '25%' },
  premier: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Premier', commission: '20%' },
};

export default function PartnersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredPartners = mockPartners.filter((partner) => {
    const matchesSearch = partner.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      partner.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || partner.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const approvedCount = mockPartners.filter((p) => p.status === 'approved').length;
  const pendingCount = mockPartners.filter((p) => p.status === 'pending').length;
  const totalRevenue = mockPartners.reduce((sum, p) => sum + p.lifetimeRevenue, 0);
  const totalBots = mockPartners.reduce((sum, p) => sum + p.totalBots, 0);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Back Link */}
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Partners</h1>
          <p className="text-zinc-500 mt-1">Manage marketplace partners and their bots</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Partner
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Partners" value={approvedCount} icon={Users} color="emerald" />
        <StatCard label="Pending" value={pendingCount} icon={Clock} color="amber" highlight={pendingCount > 0} />
        <StatCard label="Total Bots" value={totalBots} icon={Package} color="blue" />
        <StatCard label="Lifetime Revenue" value={`$${(totalRevenue / 1000).toFixed(0)}k`} icon={DollarSign} color="emerald" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search partners..."
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
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Partners Table */}
      <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
        {/* Desktop Header */}
        <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 border-b border-zinc-100 bg-zinc-50/50 text-xs font-medium text-zinc-500 uppercase tracking-wide">
          <div className="col-span-3">Partner</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Tier</div>
          <div className="col-span-2">Bots / Installs</div>
          <div className="col-span-2">Lifetime Rev</div>
          <div className="col-span-1"></div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-zinc-100">
          {filteredPartners.map((partner) => {
            const status = statusConfig[partner.status];
            const StatusIcon = status.icon;
            const tier = tierConfig[partner.revenueShareTier];

            return (
              <div key={partner.id} className="hover:bg-zinc-50 transition-colors">
                {/* Desktop Row */}
                <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-4 items-center">
                  <div className="col-span-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-5 w-5 text-zinc-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 truncate">{partner.name}</p>
                      <p className="text-sm text-zinc-500 truncate">{partner.email}</p>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${tier.bg} ${tier.text}`}>
                      {tier.label}
                    </span>
                    <p className="text-xs text-zinc-500 mt-0.5">{tier.commission} commission</p>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-zinc-600">
                        <Package className="h-3.5 w-3.5 text-zinc-400" />
                        {partner.totalBots}
                      </span>
                      <span className="flex items-center gap-1 text-zinc-600">
                        <Download className="h-3.5 w-3.5 text-zinc-400" />
                        {partner.totalInstalls}
                      </span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-zinc-900">
                      ${partner.lifetimeRevenue.toLocaleString()}
                    </span>
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-2">
                    {partner.status === 'pending' && (
                      <Button size="sm">Approve</Button>
                    )}
                    {partner.website && (
                      <a
                        href={partner.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
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
                        <p className="font-medium text-zinc-900">{partner.name}</p>
                        <p className="text-sm text-zinc-500">{partner.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${status.bgColor} ${status.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${tier.bg} ${tier.text}`}>
                        {tier.label}
                      </span>
                    </div>
                    <span className="font-medium text-zinc-900">
                      ${(partner.lifetimeRevenue / 1000).toFixed(0)}k
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredPartners.length === 0 && (
          <div className="px-5 py-12 text-center">
            <Users className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-900">No partners found</p>
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
