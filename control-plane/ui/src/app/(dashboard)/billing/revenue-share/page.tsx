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
  DollarSign,
  TrendingUp,
  Users,
  Search,
  CheckCircle2,
  Clock,
  Send,
  Building2,
  Percent,
} from 'lucide-react';

// Mock data
const mockRevenueShare = [
  {
    id: '1',
    partnerId: 'partner-1',
    partnerName: 'Automation Experts Inc',
    period: '2025-01',
    grossRevenue: 25000,
    skuldCommission: 5000,
    partnerPayout: 20000,
    commissionRate: 0.20,
    status: 'approved',
  },
  {
    id: '2',
    partnerId: 'partner-2',
    partnerName: 'RPA Solutions Ltd',
    period: '2025-01',
    grossRevenue: 18500,
    skuldCommission: 5550,
    partnerPayout: 12950,
    commissionRate: 0.30,
    status: 'pending',
  },
  {
    id: '3',
    partnerId: 'partner-3',
    partnerName: 'Bot Factory Co',
    period: '2025-01',
    grossRevenue: 42000,
    skuldCommission: 10500,
    partnerPayout: 31500,
    commissionRate: 0.25,
    status: 'paid',
  },
];

const mockPartners = [
  { id: 'partner-1', name: 'Automation Experts Inc', tier: 'premier', commissionRate: 0.20, lifetimeRevenue: 450000, pendingPayout: 20000 },
  { id: 'partner-2', name: 'RPA Solutions Ltd', tier: 'starter', commissionRate: 0.30, lifetimeRevenue: 45000, pendingPayout: 12950 },
  { id: 'partner-3', name: 'Bot Factory Co', tier: 'established', commissionRate: 0.25, lifetimeRevenue: 280000, pendingPayout: 0 },
];

const tierColors: Record<string, { bg: string; text: string }> = {
  starter: { bg: 'bg-zinc-100', text: 'text-zinc-700' },
  established: { bg: 'bg-blue-50', text: 'text-blue-700' },
  premier: { bg: 'bg-violet-50', text: 'text-violet-700' },
};

const statusConfig: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock },
  approved: { bg: 'bg-blue-50', text: 'text-blue-700', icon: CheckCircle2 },
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: DollarSign },
};

export default function RevenueSharePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('2025-01');

  const filteredRecords = mockRevenueShare.filter(
    (record) =>
      record.partnerName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      record.period === selectedPeriod
  );

  const totalGross = filteredRecords.reduce((sum, r) => sum + r.grossRevenue, 0);
  const totalCommission = filteredRecords.reduce((sum, r) => sum + r.skuldCommission, 0);
  const totalPayout = filteredRecords.reduce((sum, r) => sum + r.partnerPayout, 0);
  const pendingCount = filteredRecords.filter((r) => r.status === 'pending').length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Back Link */}
      <Link
        href="/billing"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Revenue Share</h1>
          <p className="text-zinc-500 mt-1">Manage partner payouts and commissions</p>
        </div>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2025-01">January 2025</SelectItem>
            <SelectItem value="2024-12">December 2024</SelectItem>
            <SelectItem value="2024-11">November 2024</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Gross Revenue" value={`$${(totalGross / 1000).toFixed(0)}k`} icon={DollarSign} color="emerald" />
        <StatCard label="Skuld Commission" value={`$${(totalCommission / 1000).toFixed(0)}k`} icon={Percent} color="blue" />
        <StatCard label="Partner Payouts" value={`$${(totalPayout / 1000).toFixed(0)}k`} icon={TrendingUp} color="violet" />
        <StatCard label="Pending Approval" value={pendingCount} icon={Clock} color="amber" highlight={pendingCount > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Share Records */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="font-medium text-zinc-900">Revenue Share Records</h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  type="text"
                  placeholder="Search partners..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-10"
                />
              </div>
            </div>
            <div className="divide-y divide-zinc-100">
              {filteredRecords.map((record) => {
                const status = statusConfig[record.status];
                const StatusIcon = status.icon;

                return (
                  <div key={record.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-5 w-5 text-zinc-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{record.partnerName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                            <StatusIcon className="h-3 w-3" />
                            {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {(record.commissionRate * 100).toFixed(0)}% commission
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Gross: ${record.grossRevenue.toLocaleString()}</p>
                        <p className="text-lg font-semibold text-zinc-900">${record.partnerPayout.toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        {record.status === 'pending' && (
                          <Button variant="outline" size="sm">
                            Approve
                          </Button>
                        )}
                        {record.status === 'approved' && (
                          <Button size="sm">
                            <Send className="h-3.5 w-3.5 mr-1.5" />
                            Pay Out
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredRecords.length === 0 && (
                <div className="px-5 py-12 text-center">
                  <TrendingUp className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">No records for this period</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Partners & Tiers */}
        <div className="space-y-6">
          {/* Partners */}
          <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" />
              <h2 className="font-medium text-zinc-900">Partners</h2>
            </div>
            <div className="p-3 space-y-2">
              {mockPartners.map((partner) => {
                const tier = tierColors[partner.tier];
                return (
                  <div key={partner.id} className="p-3 rounded-lg bg-zinc-50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-zinc-900 text-sm">{partner.name}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${tier.bg} ${tier.text}`}>
                        {partner.tier.charAt(0).toUpperCase() + partner.tier.slice(1)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-zinc-500">Commission</p>
                        <p className="font-medium text-zinc-900">{(partner.commissionRate * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Lifetime</p>
                        <p className="font-medium text-zinc-900">${(partner.lifetimeRevenue / 1000).toFixed(0)}k</p>
                      </div>
                    </div>
                    {partner.pendingPayout > 0 && (
                      <p className="text-xs font-medium text-amber-600 mt-2">
                        Pending: ${partner.pendingPayout.toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Commission Tiers */}
          <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Commission Tiers</h2>
            </div>
            <div className="p-3 space-y-2">
              <TierItem tier="Starter" range="$0 – $100k" rate="70%" bgColor="bg-zinc-50" />
              <TierItem tier="Established" range="$100k – $1M" rate="75%" bgColor="bg-blue-50" />
              <TierItem tier="Premier" range="$1M+" rate="80%" bgColor="bg-violet-50" />
            </div>
          </div>
        </div>
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
  color: 'emerald' | 'blue' | 'violet' | 'amber';
  highlight?: boolean;
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
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

function TierItem({ tier, range, rate, bgColor }: { tier: string; range: string; rate: string; bgColor: string }) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${bgColor}`}>
      <div>
        <p className="font-medium text-zinc-900 text-sm">{tier}</p>
        <p className="text-xs text-zinc-500">{range}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold text-zinc-900">{rate}</p>
        <p className="text-xs text-zinc-500">to partner</p>
      </div>
    </div>
  );
}
