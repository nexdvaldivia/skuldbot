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
  Server,
  Plus,
  Search,
  Globe,
  Building2,
  Key,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  MoreHorizontal,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

// Mock data
const mockTenants = [
  {
    id: '1',
    clientId: '1',
    clientName: 'Acme Corporation',
    name: 'Production',
    slug: 'acme-prod',
    environment: 'production',
    deploymentType: 'saas',
    status: 'active',
    region: 'us-east-1',
    apiUrl: 'https://acme-prod.orchestrator.skuldbot.com',
    hasActiveLicense: true,
    botsDeployed: 12,
    runnersActive: 4,
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    clientId: '1',
    clientName: 'Acme Corporation',
    name: 'Staging',
    slug: 'acme-staging',
    environment: 'staging',
    deploymentType: 'saas',
    status: 'active',
    region: 'us-east-1',
    apiUrl: 'https://acme-staging.orchestrator.skuldbot.com',
    hasActiveLicense: true,
    botsDeployed: 8,
    runnersActive: 2,
    createdAt: '2024-01-16',
  },
  {
    id: '3',
    clientId: '2',
    clientName: 'TechStart Inc',
    name: 'Main',
    slug: 'techstart-main',
    environment: 'production',
    deploymentType: 'saas',
    status: 'provisioning',
    region: 'eu-west-1',
    apiUrl: null,
    hasActiveLicense: false,
    botsDeployed: 0,
    runnersActive: 0,
    createdAt: '2024-03-01',
  },
  {
    id: '4',
    clientId: '3',
    clientName: 'Global Services Ltd',
    name: 'Development',
    slug: 'global-dev',
    environment: 'development',
    deploymentType: 'saas',
    status: 'suspended',
    region: 'us-west-2',
    apiUrl: 'https://global-dev.orchestrator.skuldbot.com',
    hasActiveLicense: false,
    botsDeployed: 3,
    runnersActive: 0,
    createdAt: '2024-02-28',
  },
  {
    id: '5',
    clientId: '5',
    clientName: 'Insurance Partners Inc',
    name: 'Production',
    slug: 'insurance-prod',
    environment: 'production',
    deploymentType: 'dedicated',
    status: 'active',
    region: 'us-east-1',
    apiUrl: 'https://insurance-prod.orchestrator.skuldbot.com',
    hasActiveLicense: true,
    botsDeployed: 25,
    runnersActive: 8,
    createdAt: '2023-11-10',
  },
];

const envConfig: Record<string, { bg: string; text: string; label: string }> = {
  production: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Production' },
  staging: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Staging' },
  development: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Development' },
  qa: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'QA' },
};

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  active: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Active' },
  provisioning: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock, label: 'Provisioning' },
  suspended: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Suspended' },
  deactivated: { color: 'text-zinc-500', bgColor: 'bg-zinc-100', icon: XCircle, label: 'Deactivated' },
  error: { color: 'text-red-700', bgColor: 'bg-red-50', icon: AlertTriangle, label: 'Error' },
};

export default function TenantsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<string>('all');

  const filteredTenants = mockTenants.filter((tenant) => {
    const matchesSearch = tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
    const matchesEnv = envFilter === 'all' || tenant.environment === envFilter;
    return matchesSearch && matchesStatus && matchesEnv;
  });

  const activeCount = mockTenants.filter((t) => t.status === 'active').length;
  const provisioningCount = mockTenants.filter((t) => t.status === 'provisioning').length;
  const totalBots = mockTenants.reduce((sum, t) => sum + t.botsDeployed, 0);
  const totalRunners = mockTenants.reduce((sum, t) => sum + t.runnersActive, 0);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Orchestrators</h1>
          <p className="text-zinc-500 mt-1">Manage client orchestrator instances</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Orchestrator
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active" value={activeCount} icon={Server} color="emerald" />
        <StatCard label="Provisioning" value={provisioningCount} icon={Clock} color="amber" highlight={provisioningCount > 0} />
        <StatCard label="Total Bots" value={totalBots} icon={Server} color="blue" />
        <StatCard label="Active Runners" value={totalRunners} icon={Server} color="violet" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search orchestrators..."
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
            <SelectItem value="provisioning">Provisioning</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={envFilter} onValueChange={setEnvFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Environments</SelectItem>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="development">Development</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orchestrators Table */}
      <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
        {/* Desktop Header */}
        <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 border-b border-zinc-100 bg-zinc-50/50 text-xs font-medium text-zinc-500 uppercase tracking-wide">
          <div className="col-span-3">Orchestrator</div>
          <div className="col-span-2">Client</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Environment</div>
          <div className="col-span-2">Activity</div>
          <div className="col-span-1"></div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-zinc-100">
          {filteredTenants.map((tenant) => {
            const status = statusConfig[tenant.status];
            const StatusIcon = status.icon;
            const env = envConfig[tenant.environment];

            return (
              <div key={tenant.id} className="hover:bg-zinc-50 transition-colors">
                {/* Desktop Row */}
                <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-4 items-center">
                  <div className="col-span-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <Server className="h-5 w-5 text-zinc-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 truncate">{tenant.name}</p>
                      <p className="text-sm text-zinc-500 truncate">{tenant.slug}</p>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm text-zinc-600 truncate">{tenant.clientName}</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                      {tenant.hasActiveLicense && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                          <Key className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${env.bg} ${env.text}`}>
                      {env.label}
                    </span>
                    <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
                      <Globe className="h-3 w-3" />
                      {tenant.region}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-zinc-600">
                      <p>{tenant.botsDeployed} bots</p>
                      <p className="text-zinc-400">{tenant.runnersActive} runners</p>
                    </div>
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-2">
                    <Link
                      href={`/tenants/${tenant.id}`}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    {tenant.apiUrl && (
                      <a
                        href={tenant.apiUrl}
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
                        <Server className="h-5 w-5 text-zinc-500" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900">{tenant.name}</p>
                        <p className="text-sm text-zinc-500">{tenant.clientName}</p>
                      </div>
                    </div>
                    <Link
                      href={`/tenants/${tenant.id}`}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${status.bgColor} ${status.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${env.bg} ${env.text}`}>
                        {env.label}
                      </span>
                      {tenant.hasActiveLicense && (
                        <Key className="h-3 w-3 text-emerald-600" />
                      )}
                    </div>
                    <span className="text-sm text-zinc-500">{tenant.botsDeployed} bots</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredTenants.length === 0 && (
          <div className="px-5 py-12 text-center">
            <Server className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-900">No orchestrators found</p>
            <p className="text-sm text-zinc-500 mt-1">Try adjusting your filters or create a new orchestrator.</p>
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
  color: 'emerald' | 'blue' | 'amber' | 'violet';
  highlight?: boolean;
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
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
