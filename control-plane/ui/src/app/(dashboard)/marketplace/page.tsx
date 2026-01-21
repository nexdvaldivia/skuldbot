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
} from 'lucide-react';

// Mock data
const mockBots = [
  {
    id: '1',
    name: 'FNOL Voice Handler',
    slug: 'fnol-voice-handler',
    description: 'Automated first notice of loss handling via voice calls',
    category: 'insurance',
    executionMode: 'runner',
    publisher: { name: 'Skuld', verified: true },
    status: 'published',
    currentVersion: '2.1.0',
    pricing: { model: 'hybrid', monthlyBase: 500 },
    stats: { installs: 45, rating: 4.8 },
  },
  {
    id: '2',
    name: 'Email Claim Processor',
    slug: 'email-claim-processor',
    description: 'Process insurance claims from email attachments automatically',
    category: 'insurance',
    executionMode: 'cloud',
    publisher: { name: 'Automation Experts', verified: true },
    status: 'published',
    currentVersion: '1.5.2',
    pricing: { model: 'usage' },
    stats: { installs: 78, rating: 4.5 },
  },
  {
    id: '3',
    name: 'Invoice Data Extractor',
    slug: 'invoice-data-extractor',
    description: 'Extract structured data from PDF invoices using AI',
    category: 'finance',
    executionMode: 'cloud',
    publisher: { name: 'RPA Solutions', verified: false },
    status: 'pending_review',
    currentVersion: '1.0.0',
    pricing: { model: 'subscription', monthlyBase: 299 },
    stats: { installs: 0, rating: 0 },
  },
  {
    id: '4',
    name: 'HR Onboarding Assistant',
    slug: 'hr-onboarding-assistant',
    description: 'Automate employee onboarding workflows and document collection',
    category: 'hr',
    executionMode: 'hybrid',
    publisher: { name: 'Skuld', verified: true },
    status: 'published',
    currentVersion: '1.2.0',
    pricing: { model: 'free' },
    stats: { installs: 156, rating: 4.2 },
  },
  {
    id: '5',
    name: 'SAP Integration Bot',
    slug: 'sap-integration-bot',
    description: 'Bidirectional data sync with SAP ERP systems',
    category: 'custom',
    executionMode: 'runner',
    publisher: { name: 'Bot Factory', verified: true },
    status: 'draft',
    currentVersion: '0.9.0',
    pricing: { model: 'subscription', monthlyBase: 999 },
    stats: { installs: 0, rating: 0 },
  },
];

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  published: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Published' },
  approved: { color: 'text-blue-700', bgColor: 'bg-blue-50', icon: CheckCircle2, label: 'Approved' },
  pending_review: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock, label: 'Pending' },
  draft: { color: 'text-zinc-600', bgColor: 'bg-zinc-100', icon: AlertCircle, label: 'Draft' },
  deprecated: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Deprecated' },
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
  custom: { bg: 'bg-zinc-100', text: 'text-zinc-700' },
};

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredBots = mockBots.filter((bot) => {
    const matchesSearch = bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bot.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || bot.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const publishedCount = mockBots.filter((b) => b.status === 'published').length;
  const pendingCount = mockBots.filter((b) => b.status === 'pending_review').length;
  const totalInstalls = mockBots.reduce((sum, b) => sum + b.stats.installs, 0);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Header */}
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
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Bot
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Published Bots" value={publishedCount} icon={Package} color="emerald" />
        <StatCard label="Pending Review" value={pendingCount} icon={Clock} color="amber" highlight={pendingCount > 0} />
        <StatCard label="Total Installs" value={totalInstalls} icon={Download} color="blue" />
        <StatCard label="Avg Rating" value="4.5" icon={Star} color="amber" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search bots..."
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
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBots.map((bot) => {
          const status = statusConfig[bot.status];
          const StatusIcon = status.icon;
          const execMode = executionModeConfig[bot.executionMode];
          const ExecIcon = execMode.icon;
          const category = categoryConfig[bot.category] || categoryConfig.custom;

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

              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${status.bgColor} ${status.color}`}>
                  <StatusIcon className="h-3 w-3" />
                  {status.label}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${category.bg} ${category.text}`}>
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
                  {bot.stats.installs > 0 && (
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      {bot.stats.installs}
                    </span>
                  )}
                  {bot.stats.rating > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500" />
                      {bot.stats.rating}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredBots.length === 0 && (
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <Package className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-900">No bots found</p>
          <p className="text-sm text-zinc-500 mt-1">Try adjusting your search or filters</p>
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
