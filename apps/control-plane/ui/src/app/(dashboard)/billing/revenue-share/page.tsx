'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { billingApi, marketplaceApi, type Partner, type RevenueShare } from '@/lib/api';
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
  Calculator,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

type RevenueShareStatus = RevenueShare['status'];

type RevenueRow = RevenueShare & {
  partnerName: string;
  tier?: Partner['revenueShareTier'];
};

const tierColors: Record<string, { bg: string; text: string }> = {
  starter: { bg: 'bg-zinc-100', text: 'text-zinc-700' },
  established: { bg: 'bg-blue-50', text: 'text-blue-700' },
  premier: { bg: 'bg-violet-50', text: 'text-violet-700' },
};

const statusConfig: Record<
  RevenueShareStatus,
  { bg: string; text: string; icon: React.ElementType; label: string }
> = {
  calculated: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, label: 'Calculated' },
  approved: { bg: 'bg-blue-50', text: 'text-blue-700', icon: CheckCircle2, label: 'Approved' },
  transferred: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: Send, label: 'Transferred' },
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: DollarSign, label: 'Paid' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', icon: AlertTriangle, label: 'Failed' },
};

function getPeriodOptions(): Array<{ value: string; label: string }> {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return Array.from({ length: 6 }).map((_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: formatter.format(date) };
  });
}

export default function RevenueSharePage() {
  const periodOptions = useMemo(() => getPeriodOptions(), []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(periodOptions[0]?.value ?? '');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [records, setRecords] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);

  const loadData = async (period: string) => {
    try {
      setLoading(true);

      const partnersData = await marketplaceApi.listPartners();
      setPartners(partnersData);

      const partnerMap = new Map(partnersData.map((partner) => [partner.id, partner]));

      const responses = await Promise.all(
        partnersData.map(async (partner) => {
          const result = await billingApi.getPartnerRevenueShare(
            partner.id,
            period,
            period,
          );
          return result;
        }),
      );

      const merged = responses
        .flat()
        .map((record) => ({
          ...record,
          partnerName: (record as RevenueRow).partnerName || partnerMap.get(record.partnerId)?.name || record.partnerId,
          tier: partnerMap.get(record.partnerId)?.revenueShareTier,
        }));

      setRecords(merged);
    } catch (error) {
      setPartners([]);
      setRecords([]);
      toast({
        variant: 'error',
        title: 'Failed to load revenue share',
        description:
          error instanceof Error ? error.message : 'Could not fetch revenue share data.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPeriod) return;
    void loadData(selectedPeriod);
  }, [selectedPeriod]);

  const filteredRecords = records.filter((record) =>
    record.partnerName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalGross = filteredRecords.reduce((sum, record) => sum + Number(record.grossRevenue || 0), 0);
  const totalCommission = filteredRecords.reduce((sum, record) => sum + Number(record.skuldCommission || 0), 0);
  const totalPayout = filteredRecords.reduce((sum, record) => sum + Number(record.partnerPayout || 0), 0);
  const pendingCount = filteredRecords.filter((record) => ['calculated', 'approved', 'transferred'].includes(record.status)).length;

  const handleCalculatePeriod = async () => {
    if (!selectedPeriod) return;

    try {
      setCalculating(true);
      const approvedPartners = partners.filter((partner) => partner.status === 'approved');

      await Promise.all(
        approvedPartners.map((partner) =>
          billingApi.calculateRevenueShare(partner.id, selectedPeriod),
        ),
      );

      toast({
        variant: 'success',
        title: 'Revenue calculated',
        description: `Revenue share recalculated for ${selectedPeriod}.`,
      });

      await loadData(selectedPeriod);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Calculation failed',
        description:
          error instanceof Error ? error.message : 'Could not calculate revenue share.',
      });
    } finally {
      setCalculating(false);
    }
  };

  const handleApprove = async (record: RevenueRow) => {
    try {
      setActiveRecordId(record.id);
      await billingApi.approveRevenueShare(record.id, 'control-plane-ui');
      toast({
        variant: 'success',
        title: 'Record approved',
        description: `${record.partnerName} for ${record.period} is now approved.`,
      });
      await loadData(selectedPeriod);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Approval failed',
        description: error instanceof Error ? error.message : 'Could not approve record.',
      });
    } finally {
      setActiveRecordId(null);
    }
  };

  const handlePayout = async (record: RevenueRow) => {
    try {
      setActivePartnerId(record.partnerId);
      const result = await billingApi.createPayout(record.partnerId);
      toast({
        variant: 'success',
        title: 'Payout requested',
        description:
          result.message || `Payout initiated for ${record.partnerName}.`,
      });
      await loadData(selectedPeriod);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Payout failed',
        description: error instanceof Error ? error.message : 'Could not create payout.',
      });
    } finally {
      setActivePartnerId(null);
    }
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      <Link
        href="/billing"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Revenue Share</h1>
          <p className="text-zinc-500 mt-1">Manage partner payouts and commissions</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={handleCalculatePeriod}
            disabled={calculating || loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-60"
          >
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Calculate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Gross Revenue" value={`$${(totalGross / 1000).toFixed(0)}k`} icon={DollarSign} color="emerald" />
        <StatCard label="Skuld Commission" value={`$${(totalCommission / 1000).toFixed(0)}k`} icon={Percent} color="blue" />
        <StatCard label="Partner Payouts" value={`$${(totalPayout / 1000).toFixed(0)}k`} icon={TrendingUp} color="violet" />
        <StatCard label="Pending Approval" value={pendingCount} icon={Clock} color="amber" highlight={pendingCount > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-9 pl-10"
                />
              </div>
            </div>
            <div className="divide-y divide-zinc-100">
              {loading ? (
                <div className="px-5 py-10 text-center text-sm text-zinc-500">Loading records...</div>
              ) : (
                filteredRecords.map((record) => {
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
                              {status.label}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {(Number(record.commissionRate || 0) * 100).toFixed(0)}% commission
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">Gross: ${Number(record.grossRevenue || 0).toLocaleString()}</p>
                          <p className="text-lg font-semibold text-zinc-900">${Number(record.partnerPayout || 0).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2">
                          {record.status === 'calculated' && (
                            <button
                              onClick={() => handleApprove(record)}
                              disabled={activeRecordId === record.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-60"
                            >
                              {activeRecordId === record.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              Approve
                            </button>
                          )}
                          {['approved', 'transferred'].includes(record.status) && (
                            <button
                              onClick={() => handlePayout(record)}
                              disabled={activePartnerId === record.partnerId}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                            >
                              {activePartnerId === record.partnerId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              Pay Out
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {!loading && filteredRecords.length === 0 && (
                <div className="px-5 py-12 text-center">
                  <TrendingUp className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">No records for this period</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" />
              <h2 className="font-medium text-zinc-900">Partners</h2>
            </div>
            <div className="p-3 space-y-2">
              {partners.map((partner) => {
                const tier = tierColors[partner.revenueShareTier] || tierColors.starter;
                const pendingPayout = Number(partner.pendingPayout || 0);

                return (
                  <div key={partner.id} className="p-3 rounded-lg bg-zinc-50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-zinc-900 text-sm">{partner.name}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${tier.bg} ${tier.text}`}>
                        {partner.revenueShareTier.charAt(0).toUpperCase() + partner.revenueShareTier.slice(1)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-zinc-500">Commission</p>
                        <p className="font-medium text-zinc-900">
                          {({ starter: '30%', established: '25%', premier: '20%' } as Record<string, string>)[partner.revenueShareTier] || '30%'}
                        </p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Lifetime</p>
                        <p className="font-medium text-zinc-900">${(Number(partner.lifetimeRevenue || 0) / 1000).toFixed(0)}k</p>
                      </div>
                    </div>
                    {pendingPayout > 0 && (
                      <p className="text-xs font-medium text-amber-600 mt-2">
                        Pending: ${pendingPayout.toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}

              {!partners.length && !loading && (
                <div className="p-3 text-sm text-zinc-500 text-center">No partners available.</div>
              )}
            </div>
          </div>

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
