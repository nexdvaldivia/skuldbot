'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
import { marketplaceApi, type MarketplaceBot, type Partner } from '@/lib/api';
import {
  Package,
  Plus,
  Search,
  Star,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Cloud,
  Server,
  Zap,
  Users,
  ChevronRight,
  Loader2,
} from 'lucide-react';

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  published: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Published' },
  approved: { color: 'text-blue-700', bgColor: 'bg-blue-50', icon: CheckCircle2, label: 'Approved' },
  pending_review: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock, label: 'Pending' },
  draft: { color: 'text-zinc-600', bgColor: 'bg-zinc-100', icon: AlertCircle, label: 'Draft' },
  deprecated: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Deprecated' },
  rejected: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Rejected' },
};

const executionModeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  cloud: { icon: Cloud, label: 'Cloud', color: 'text-blue-600' },
  runner: { icon: Server, label: 'Runner', color: 'text-violet-600' },
  hybrid: { icon: Zap, label: 'Hybrid', color: 'text-amber-600' },
};

const categoryConfig: Record<string, { bg: string; text: string }> = {
  insurance: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  finance: { bg: 'bg-blue-50', text: 'text-blue-700' },
  hr: { bg: 'bg-violet-50', text: 'text-violet-700' },
  sales: { bg: 'bg-amber-50', text: 'text-amber-700' },
  email: { bg: 'bg-rose-50', text: 'text-rose-700' },
  healthcare: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  logistics: { bg: 'bg-lime-50', text: 'text-lime-700' },
  custom: { bg: 'bg-zinc-100', text: 'text-zinc-700' },
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function MarketplacePage() {
  const [bots, setBots] = useState<MarketplaceBot[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('insurance');
  const [executionMode, setExecutionMode] = useState<'cloud' | 'runner' | 'hybrid'>('runner');
  const [pricingModel, setPricingModel] = useState<'free' | 'subscription' | 'usage' | 'hybrid'>('usage');
  const [monthlyBase, setMonthlyBase] = useState('');
  const [publisherId, setPublisherId] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [botsData, partnersData] = await Promise.all([
        marketplaceApi.listBots(),
        marketplaceApi.listPartners(),
      ]);

      setBots(botsData);
      setPartners(partnersData);

      if (!publisherId) {
        const defaultPublisher = partnersData.find((partner) => partner.status === 'approved');
        if (defaultPublisher) {
          setPublisherId(defaultPublisher.id);
        }
      }
    } catch (error) {
      setBots([]);
      toast({
        variant: 'error',
        title: 'Failed to load marketplace',
        description: error instanceof Error ? error.message : 'Could not fetch marketplace data.',
      });
    } finally {
      setLoading(false);
    }
  }, [publisherId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const approvedPartners = partners.filter((partner) => partner.status === 'approved');

  const filteredBots = useMemo(() => {
    return bots.filter((bot) => {
      const matchesSearch =
        bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bot.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || bot.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [bots, searchQuery, statusFilter]);

  const publishedCount = bots.filter((bot) => bot.status === 'published').length;
  const pendingCount = bots.filter((bot) => bot.status === 'pending_review').length;
  const totalInstalls = bots.reduce((sum, bot) => sum + Number(bot.stats?.installs || bot.installs || 0), 0);
  const avgRating = bots.length
    ? bots.reduce((sum, bot) => sum + Number(bot.stats?.rating || bot.rating || 0), 0) / bots.length
    : 0;

  const resetCreateForm = () => {
    setName('');
    setSlug('');
    setDescription('');
    setCategory('insurance');
    setExecutionMode('runner');
    setPricingModel('usage');
    setMonthlyBase('');
  };

  const handleCreateBot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedSlug = (slug.trim() || slugify(normalizedName)).slice(0, 100);
    const normalizedDescription = description.trim();

    if (!normalizedName || !normalizedSlug || !normalizedDescription || !publisherId) {
      toast({
        variant: 'warning',
        title: 'Missing required fields',
        description: 'Name, slug, description and publisher are required.',
      });
      return;
    }

    const monthlyBaseValue = Number(monthlyBase);

    try {
      setCreating(true);
      await marketplaceApi.createBot({
        name: normalizedName,
        slug: normalizedSlug,
        description: normalizedDescription,
        category,
        executionMode,
        publisherId,
        tags: [],
        pricing: {
          model: pricingModel,
          ...(pricingModel === 'subscription' || pricingModel === 'hybrid'
            ? {
                monthlyBase: Number.isFinite(monthlyBaseValue)
                  ? monthlyBaseValue
                  : undefined,
              }
            : {}),
        },
      });

      toast({
        variant: 'success',
        title: 'Bot created',
        description: `${normalizedName} was created as draft.`,
      });

      setOpenCreate(false);
      resetCreateForm();
      await loadData();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to create bot',
        description: error instanceof Error ? error.message : 'Could not create bot.',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Marketplace</h1>
            <p className="text-zinc-500 mt-1">Manage bot catalog and partner submissions</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/marketplace/partners"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <Users className="h-4 w-4" />
              Partners
            </Link>
            <Link
              href="/marketplace/submissions"
              className="relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <Clock className="h-4 w-4" />
              Submissions
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center px-1 rounded-full bg-amber-500 text-white text-xs font-semibold">
                  {pendingCount}
                </span>
              )}
            </Link>
            <Button onClick={() => setOpenCreate(true)} disabled={approvedPartners.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              New Bot
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Published Bots" value={publishedCount} icon={Package} color="emerald" />
          <StatCard label="Pending Review" value={pendingCount} icon={Clock} color="amber" highlight={pendingCount > 0} />
          <StatCard label="Total Installs" value={totalInstalls} icon={Download} color="blue" />
          <StatCard label="Avg Rating" value={avgRating.toFixed(1)} icon={Star} color="amber" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search bots..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
            <Loader2 className="h-8 w-8 text-zinc-400 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-zinc-500">Loading marketplace...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBots.map((bot) => {
                const status = statusConfig[bot.status] || statusConfig.draft;
                const StatusIcon = status.icon;
                const execMode = executionModeConfig[bot.executionMode] || executionModeConfig.runner;
                const ExecIcon = execMode.icon;
                const categoryStyle = categoryConfig[bot.category] || categoryConfig.custom;

                return (
                  <Link
                    key={bot.id}
                    href={`/marketplace/bots/${bot.id}`}
                    className="bg-white rounded-xl border border-zinc-200/80 p-5 hover:border-zinc-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                        {bot.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-zinc-900 group-hover:text-indigo-600 transition-colors">
                          {bot.name}
                        </h3>
                        <p className="text-xs text-zinc-500">v{bot.currentVersion}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 flex-shrink-0 mt-1" />
                    </div>

                    <p className="text-sm text-zinc-600 mb-4 line-clamp-2">{bot.description}</p>

                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${status.bgColor} ${status.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryStyle.bg} ${categoryStyle.text}`}>
                        {bot.category}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${execMode.color}`}>
                        <ExecIcon className="h-3 w-3" />
                        {execMode.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
                      <div className="flex items-center gap-1">
                        {bot.publisher.verified && <CheckCircle2 className="h-3 w-3 text-blue-500" />}
                        <span className="text-xs text-zinc-500">{bot.publisher.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        {Number(bot.stats?.installs || bot.installs || 0) > 0 && (
                          <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {Number(bot.stats?.installs || bot.installs || 0)}
                          </span>
                        )}
                        {Number(bot.stats?.rating || bot.rating || 0) > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-500" />
                            {Number(bot.stats?.rating || bot.rating || 0).toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {filteredBots.length === 0 && (
              <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center mt-4">
                <Package className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-zinc-900">No bots found</p>
                <p className="text-sm text-zinc-500 mt-1">Try adjusting your search or filters</p>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Marketplace Bot</DialogTitle>
            <DialogDescription>
              Register a new bot draft for partner publication.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateBot}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700" htmlFor="bot-name">
                Bot Name
              </label>
              <Input
                id="bot-name"
                value={name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setName(nextName);
                  if (!slug) {
                    setSlug(slugify(nextName));
                  }
                }}
                placeholder="FNOL Voice Handler"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700" htmlFor="bot-slug">
                Slug
              </label>
              <Input
                id="bot-slug"
                value={slug}
                onChange={(event) => setSlug(slugify(event.target.value))}
                placeholder="fnol-voice-handler"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700" htmlFor="bot-description">
                Description
              </label>
              <textarea
                id="bot-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Short summary of what this bot automates"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="logistics">Logistics</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Execution Mode</label>
                <Select
                  value={executionMode}
                  onValueChange={(value) => setExecutionMode(value as 'cloud' | 'runner' | 'hybrid')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="runner">Runner</SelectItem>
                    <SelectItem value="cloud">Cloud</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Pricing Model</label>
                <Select
                  value={pricingModel}
                  onValueChange={(value) => setPricingModel(value as 'free' | 'subscription' | 'usage' | 'hybrid')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="usage">Usage</SelectItem>
                    <SelectItem value="subscription">Subscription</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(pricingModel === 'subscription' || pricingModel === 'hybrid') && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700" htmlFor="monthly-base">
                    Monthly Base
                  </label>
                  <Input
                    id="monthly-base"
                    type="number"
                    min={0}
                    value={monthlyBase}
                    onChange={(event) => setMonthlyBase(event.target.value)}
                    placeholder="500"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Publisher</label>
              <Select value={publisherId} onValueChange={setPublisherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select approved partner" />
                </SelectTrigger>
                <SelectContent>
                  {approvedPartners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {approvedPartners.length === 0 && (
              <p className="text-xs text-amber-600">
                No approved partners available. Approve a partner first.
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || approvedPartners.length === 0}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Create Bot
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
