'use client';

import { useState } from 'react';
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
  Key,
  Plus,
  Search,
  Copy,
  Check,
  AlertCircle,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  MoreHorizontal,
  Bot,
  Cpu,
  Sparkles,
  Shield,
} from 'lucide-react';

// Mock data
const mockLicenses = [
  {
    id: '1',
    tenantId: '1',
    tenantName: 'Acme Production',
    clientName: 'Acme Corporation',
    key: 'SKULD-A1B2-C3D4-E5F6-G7H8',
    type: 'enterprise',
    status: 'active',
    validFrom: '2024-01-15',
    validUntil: '2025-01-15',
    isValid: true,
    features: {
      maxBots: -1,
      maxRunners: -1,
      aiAssistant: true,
      sso: true,
    },
  },
  {
    id: '2',
    tenantId: '2',
    tenantName: 'Acme Staging',
    clientName: 'Acme Corporation',
    key: 'SKULD-I9J0-K1L2-M3N4-O5P6',
    type: 'professional',
    status: 'active',
    validFrom: '2024-01-16',
    validUntil: '2025-01-16',
    isValid: true,
    features: {
      maxBots: 50,
      maxRunners: 10,
      aiAssistant: true,
      sso: true,
    },
  },
  {
    id: '3',
    tenantId: '3',
    tenantName: 'TechStart Main',
    clientName: 'TechStart Inc',
    key: 'SKULD-Q7R8-S9T0-U1V2-W3X4',
    type: 'trial',
    status: 'active',
    validFrom: '2024-03-01',
    validUntil: '2024-04-01',
    isValid: true,
    features: {
      maxBots: 3,
      maxRunners: 1,
      aiAssistant: false,
      sso: false,
    },
  },
  {
    id: '4',
    tenantId: '4',
    tenantName: 'Global Development',
    clientName: 'Global Services Ltd',
    key: 'SKULD-Y5Z6-A7B8-C9D0-E1F2',
    type: 'standard',
    status: 'expired',
    validFrom: '2023-02-28',
    validUntil: '2024-02-28',
    isValid: false,
    features: {
      maxBots: 10,
      maxRunners: 3,
      aiAssistant: true,
      sso: false,
    },
  },
  {
    id: '5',
    tenantId: '5',
    tenantName: 'Insurance Production',
    clientName: 'Insurance Partners Inc',
    key: 'SKULD-G3H4-I5J6-K7L8-M9N0',
    type: 'enterprise',
    status: 'active',
    validFrom: '2023-11-10',
    validUntil: '2025-11-10',
    isValid: true,
    features: {
      maxBots: -1,
      maxRunners: -1,
      aiAssistant: true,
      sso: true,
    },
  },
];

const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  trial: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Trial' },
  standard: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Standard' },
  professional: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Professional' },
  enterprise: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Enterprise' },
};

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  active: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Active' },
  expired: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Expired' },
  revoked: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Revoked' },
  suspended: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock, label: 'Suspended' },
};

export default function LicensesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filteredLicenses = mockLicenses.filter((license) => {
    const matchesSearch = license.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      license.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      license.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || license.status === statusFilter;
    const matchesType = typeFilter === 'all' || license.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getDaysRemaining = (validUntil: string) => {
    const today = new Date();
    const expiry = new Date(validUntil);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const activeCount = mockLicenses.filter((l) => l.status === 'active').length;
  const expiringCount = mockLicenses.filter((l) => {
    const days = getDaysRemaining(l.validUntil);
    return l.status === 'active' && days > 0 && days <= 30;
  }).length;
  const expiredCount = mockLicenses.filter((l) => l.status === 'expired').length;
  const totalLicenses = mockLicenses.length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Licenses</h1>
          <p className="text-zinc-500 mt-1">Manage orchestrator licenses</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Generate License
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active" value={activeCount} icon={Key} color="emerald" />
        <StatCard label="Expiring Soon" value={expiringCount} icon={AlertCircle} color="amber" highlight={expiringCount > 0} />
        <StatCard label="Expired" value={expiredCount} icon={XCircle} color="red" />
        <StatCard label="Total" value={totalLicenses} icon={Key} color="blue" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search licenses..."
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
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Licenses List */}
      <div className="space-y-4">
        {filteredLicenses.map((license) => {
          const daysRemaining = getDaysRemaining(license.validUntil);
          const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 30;
          const status = statusConfig[license.status];
          const StatusIcon = status.icon;
          const type = typeConfig[license.type];

          return (
            <div key={license.id} className="bg-white rounded-xl border border-zinc-200/80 p-5 hover:border-zinc-300 transition-all">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="h-12 w-12 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <Key className="h-6 w-6 text-zinc-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="font-semibold text-zinc-900">{license.tenantName}</h3>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${type.bg} ${type.text}`}>
                        {type.label}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500 mb-3">{license.clientName}</p>

                    <div className="flex items-center gap-2 mb-3">
                      <code className="text-sm bg-zinc-100 px-3 py-1.5 rounded-lg font-mono text-zinc-700">
                        {license.key}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyToClipboard(license.key)}
                      >
                        {copiedKey === license.key ? (
                          <Check className="h-4 w-4 text-brand-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-zinc-500 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Bot className="h-4 w-4 text-zinc-400" />
                        <span>
                          {license.features.maxBots === -1 ? 'Unlimited' : license.features.maxBots} bots
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Cpu className="h-4 w-4 text-zinc-400" />
                        <span>
                          {license.features.maxRunners === -1 ? 'Unlimited' : license.features.maxRunners} runners
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-zinc-400" />
                        <span>
                          Valid until {new Date(license.validUntil).toLocaleDateString()}
                        </span>
                      </div>
                      {isExpiringSoon && (
                        <div className="flex items-center gap-1.5 text-amber-600">
                          <AlertCircle className="h-4 w-4" />
                          <span className="font-medium">{daysRemaining} days remaining</span>
                        </div>
                      )}
                      {daysRemaining <= 0 && license.status !== 'expired' && (
                        <div className="flex items-center gap-1.5 text-red-600">
                          <AlertCircle className="h-4 w-4" />
                          <span className="font-medium">Expired</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      {license.features.aiAssistant && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-200 text-xs text-zinc-600">
                          <Sparkles className="h-3 w-3" />
                          AI Assistant
                        </span>
                      )}
                      {license.features.sso && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-200 text-xs text-zinc-600">
                          <Shield className="h-3 w-3" />
                          SSO
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 lg:shrink-0">
                  {license.status === 'active' && isExpiringSoon && (
                    <Button size="sm">
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Renew
                    </Button>
                  )}
                  {license.status === 'expired' && (
                    <Button variant="outline" size="sm">
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Reactivate
                    </Button>
                  )}
                  {license.status === 'active' && (
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      Revoke
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredLicenses.length === 0 && (
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <Key className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-900">No licenses found</p>
          <p className="text-sm text-zinc-500 mt-1">Try adjusting your filters or generate a new license.</p>
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
  color: 'emerald' | 'blue' | 'amber' | 'red';
  highlight?: boolean;
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
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
