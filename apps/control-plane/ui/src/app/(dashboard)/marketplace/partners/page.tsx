'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { marketplaceApi, type Partner } from '@/lib/api';
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
  Loader2,
} from 'lucide-react';

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  approved: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Approved' },
  pending: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock, label: 'Pending' },
  suspended: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Suspended' },
  terminated: { color: 'text-zinc-700', bgColor: 'bg-zinc-100', icon: XCircle, label: 'Terminated' },
};

const tierConfig: Record<string, { bg: string; text: string; label: string; commission: string }> = {
  starter: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Starter', commission: '30%' },
  established: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Established', commission: '25%' },
  premier: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Premier', commission: '20%' },
};

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');

  const loadPartners = async () => {
    try {
      setLoading(true);
      const data = await marketplaceApi.listPartners();
      setPartners(data);
    } catch (error) {
      setPartners([]);
      toast({
        variant: 'error',
        title: 'Failed to load partners',
        description: error instanceof Error ? error.message : 'Could not fetch partners.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPartners();
  }, []);

  const filteredPartners = useMemo(() => {
    return partners.filter((partner) => {
      const matchesSearch =
        partner.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        partner.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || partner.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [partners, searchQuery, statusFilter]);

  const approvedCount = partners.filter((partner) => partner.status === 'approved').length;
  const pendingCount = partners.filter((partner) => partner.status === 'pending').length;
  const totalRevenue = partners.reduce((sum, partner) => sum + Number(partner.lifetimeRevenue || 0), 0);
  const totalBots = partners.reduce((sum, partner) => sum + Number(partner.totalBots || 0), 0);

  const resetCreateForm = () => {
    setName('');
    setEmail('');
    setCompany('');
    setWebsite('');
    setDescription('');
  };

  const handleCreatePartner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCompany = company.trim();

    if (!normalizedName || !normalizedEmail || !normalizedCompany) {
      toast({
        variant: 'warning',
        title: 'Missing required fields',
        description: 'Name, email and company are required.',
      });
      return;
    }

    try {
      setCreating(true);
      await marketplaceApi.createPartner({
        name: normalizedName,
        email: normalizedEmail,
        company: normalizedCompany,
        website: website.trim() || undefined,
        description: description.trim() || undefined,
      });

      toast({
        variant: 'success',
        title: 'Partner created',
        description: `${normalizedName} was created successfully.`,
      });

      setOpenCreate(false);
      resetCreateForm();
      await loadPartners();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to create partner',
        description: error instanceof Error ? error.message : 'Could not create partner.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleApprovePartner = async (partner: Partner) => {
    try {
      setApprovingId(partner.id);
      await marketplaceApi.approvePartner(partner.id);
      toast({
        variant: 'success',
        title: 'Partner approved',
        description: `${partner.name} is now approved.`,
      });
      await loadPartners();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Approval failed',
        description: error instanceof Error ? error.message : 'Could not approve partner.',
      });
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <>
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Marketplace
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Partners</h1>
            <p className="text-zinc-500 mt-1">Manage marketplace partners and their bots</p>
          </div>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Partner
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Active Partners" value={approvedCount} icon={Users} color="emerald" />
          <StatCard label="Pending" value={pendingCount} icon={Clock} color="amber" highlight={pendingCount > 0} />
          <StatCard label="Total Bots" value={totalBots} icon={Package} color="blue" />
          <StatCard label="Lifetime Revenue" value={`$${(totalRevenue / 1000).toFixed(0)}k`} icon={DollarSign} color="emerald" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search partners..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
          <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 border-b border-zinc-100 bg-zinc-50/50 text-xs font-medium text-zinc-500 uppercase tracking-wide">
            <div className="col-span-3">Partner</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Tier</div>
            <div className="col-span-2">Bots / Installs</div>
            <div className="col-span-2">Lifetime Rev</div>
            <div className="col-span-1" />
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-zinc-500">Loading partners...</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredPartners.map((partner) => {
                const status = statusConfig[partner.status] || statusConfig.pending;
                const StatusIcon = status.icon;
                const tier = tierConfig[partner.revenueShareTier] || tierConfig.starter;

                return (
                  <div key={partner.id} className="hover:bg-zinc-50 transition-colors">
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
                          ${Number(partner.lifetimeRevenue || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-2">
                        {partner.status === 'pending' && (
                          <button
                            onClick={() => handleApprovePartner(partner)}
                            disabled={approvingId === partner.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                          >
                            {approvingId === partner.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              'Approve'
                            )}
                          </button>
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
                      </div>
                    </div>

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
                          ${(Number(partner.lifetimeRevenue || 0) / 1000).toFixed(0)}k
                        </span>
                      </div>
                      {partner.status === 'pending' && (
                        <button
                          onClick={() => handleApprovePartner(partner)}
                          disabled={approvingId === partner.id}
                          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                        >
                          {approvingId === partner.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Approve Partner'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filteredPartners.length === 0 && (
            <div className="px-5 py-12 text-center">
              <Users className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-900">No partners found</p>
              <p className="text-sm text-zinc-500 mt-1">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Partner</DialogTitle>
            <DialogDescription>
              Register a new marketplace partner.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreatePartner}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700" htmlFor="partner-name">Name</label>
              <Input
                id="partner-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Automation Experts Inc"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700" htmlFor="partner-email">Email</label>
              <Input
                id="partner-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="contact@partner.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700" htmlFor="partner-company">Company</label>
              <Input
                id="partner-company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="Partner Company LLC"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700" htmlFor="partner-website">Website</label>
              <Input
                id="partner-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://partner.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700" htmlFor="partner-description">Description</label>
              <textarea
                id="partner-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Short partner profile"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Add Partner
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
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
