'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  licensesApi,
  tenantsApi,
  clientsApi,
  type License,
  type LicenseRuntimeDecision,
} from '@/lib/api';
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
  Loader2,
  Activity,
  ShieldAlert,
} from 'lucide-react';

type LicenseRow = License & {
  tenantName: string;
  clientName: string;
};

const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  trial: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Trial' },
  standard: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Standard' },
  professional: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Professional' },
  enterprise: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Enterprise' },
};

const statusConfig: Record<
  string,
  { color: string; bgColor: string; icon: React.ElementType; label: string }
> = {
  active: {
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    icon: CheckCircle2,
    label: 'Active',
  },
  expired: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Expired' },
  revoked: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Revoked' },
  suspended: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock, label: 'Suspended' },
};

const decisionTypeLabels: Record<'entitlement_check' | 'quota_check' | 'quota_consume', string> = {
  entitlement_check: 'Entitlement Check',
  quota_check: 'Quota Check',
  quota_consume: 'Quota Consume',
};

function addOneYear(dateInput: string): string {
  const date = new Date(dateInput);
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString();
}

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [runtimeDecisions, setRuntimeDecisions] = useState<LicenseRuntimeDecision[]>([]);
  const [runtimeTenantId, setRuntimeTenantId] = useState('');
  const [runtimeDecisionType, setRuntimeDecisionType] = useState<string>('all');
  const [runtimeResourceType, setRuntimeResourceType] = useState('');
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionLicenseId, setActionLicenseId] = useState<string | null>(null);

  const loadLicenses = async () => {
    try {
      setLoading(true);

      const [licenseData, tenantData, clientData] = await Promise.all([
        licensesApi.list(),
        tenantsApi.list().catch(() => []),
        clientsApi.list().catch(() => []),
      ]);

      const tenantById = new Map(tenantData.map((tenant) => [tenant.id, tenant]));
      const clientById = new Map(clientData.map((client) => [client.id, client]));

      const mapped = licenseData.map((license) => {
        const tenant = tenantById.get(license.tenantId);
        const client = tenant ? clientById.get(tenant.clientId) : undefined;

        return {
          ...license,
          tenantName: tenant?.name || `Tenant ${license.tenantId}`,
          clientName: client?.name || 'Unassigned client',
        };
      });

      setLicenses(mapped);
    } catch (error) {
      setLicenses([]);
      toast({
        variant: 'error',
        title: 'Failed to load licenses',
        description: error instanceof Error ? error.message : 'Could not fetch licenses.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLicenses();
  }, []);

  const runtimeTenantOptions = useMemo(
    () =>
      Array.from(
        new Map(
          licenses.map((license) => [
            license.tenantId,
            { tenantId: license.tenantId, tenantName: license.tenantName },
          ]),
        ).values(),
      ).sort((a, b) => a.tenantName.localeCompare(b.tenantName)),
    [licenses],
  );

  useEffect(() => {
    if (!runtimeTenantId && runtimeTenantOptions.length > 0) {
      setRuntimeTenantId(runtimeTenantOptions[0].tenantId);
    }
  }, [runtimeTenantId, runtimeTenantOptions]);

  const loadRuntimeDecisions = async () => {
    if (!runtimeTenantId) {
      setRuntimeDecisions([]);
      return;
    }

    try {
      setRuntimeLoading(true);
      const decisions = await licensesApi.listRuntimeDecisions(runtimeTenantId, {
        limit: 120,
        decisionType:
          runtimeDecisionType === 'all'
            ? undefined
            : (runtimeDecisionType as 'entitlement_check' | 'quota_check' | 'quota_consume'),
        resourceType: runtimeResourceType.trim() || undefined,
      });
      setRuntimeDecisions(decisions);
    } catch (error) {
      setRuntimeDecisions([]);
      toast({
        variant: 'error',
        title: 'Failed to load runtime decisions',
        description:
          error instanceof Error ? error.message : 'Could not fetch license runtime traceability.',
      });
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    void loadRuntimeDecisions();
  }, [runtimeTenantId, runtimeDecisionType, runtimeResourceType]);

  const filteredLicenses = licenses.filter((license) => {
    const matchesSearch =
      license.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      license.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      license.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || license.status === statusFilter;
    const matchesType = typeFilter === 'all' || license.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const copyToClipboard = (key: string) => {
    navigator.clipboard
      .writeText(key)
      .then(() => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
        toast({
          variant: 'success',
          title: 'License key copied',
          description: 'The license key was copied to clipboard.',
        });
      })
      .catch(() => {
        toast({
          variant: 'error',
          title: 'Copy failed',
          description: 'Could not copy license key. Try again.',
        });
      });
  };

  const handleGenerateLicense = () => {
    toast({
      variant: 'warning',
      title: 'Action not available',
      description: 'License generation requires tenant context and is not wired in this view yet.',
    });
  };

  const handleRenewLicense = async (license: LicenseRow) => {
    try {
      setActionLicenseId(license.id);
      const updated = await licensesApi.update(license.id, {
        validUntil: addOneYear(license.validUntil),
        status: 'active',
      });

      setLicenses((current) =>
        current.map((item) => {
          if (item.id !== license.id) {
            return item;
          }
          return {
            ...item,
            validUntil: updated.validUntil,
            status: updated.status,
          };
        }),
      );

      toast({
        variant: 'success',
        title: 'License renewed',
        description: `${license.tenantName} license expiration was extended by one year.`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Renewal failed',
        description: error instanceof Error ? error.message : 'Could not renew license.',
      });
    } finally {
      setActionLicenseId(null);
    }
  };

  const handleReactivateLicense = async (license: LicenseRow) => {
    try {
      setActionLicenseId(license.id);
      const updated = await licensesApi.update(license.id, { status: 'active' });

      setLicenses((current) =>
        current.map((item) => {
          if (item.id !== license.id) {
            return item;
          }
          return {
            ...item,
            status: updated.status,
          };
        }),
      );

      toast({
        variant: 'success',
        title: 'License reactivated',
        description: `${license.tenantName} license is active again.`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Reactivation failed',
        description: error instanceof Error ? error.message : 'Could not reactivate license.',
      });
    } finally {
      setActionLicenseId(null);
    }
  };

  const handleRevokeLicense = async (license: LicenseRow) => {
    try {
      setActionLicenseId(license.id);
      const updated = await licensesApi.revoke(license.id);

      setLicenses((current) =>
        current.map((item) => {
          if (item.id !== license.id) {
            return item;
          }
          return {
            ...item,
            status: updated.status,
          };
        }),
      );

      toast({
        variant: 'warning',
        title: 'License revoked',
        description: `${license.tenantName} license was revoked.`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Revoke failed',
        description: error instanceof Error ? error.message : 'Could not revoke license.',
      });
    } finally {
      setActionLicenseId(null);
    }
  };

  const getDaysRemaining = (validUntil: string) => {
    const today = new Date();
    const expiry = new Date(validUntil);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const activeCount = licenses.filter((l) => l.status === 'active').length;
  const expiringCount = licenses.filter((l) => {
    const days = getDaysRemaining(l.validUntil);
    return l.status === 'active' && days > 0 && days <= 30;
  }).length;
  const expiredCount = licenses.filter((l) => l.status === 'expired').length;
  const totalLicenses = licenses.length;
  const runtimeBlockedCount = runtimeDecisions.filter((item) => !item.allowed).length;
  const runtimeAllowedCount = runtimeDecisions.filter((item) => item.allowed).length;
  const runtimeSelectedTenantName =
    runtimeTenantOptions.find((item) => item.tenantId === runtimeTenantId)?.tenantName || 'Tenant';

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Licenses</h1>
          <p className="text-zinc-500 mt-1">Manage orchestrator licenses</p>
        </div>
        <Button onClick={handleGenerateLicense}>
          <Plus className="h-4 w-4 mr-2" />
          Generate License
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active" value={activeCount} icon={Key} color="emerald" />
        <StatCard
          label="Expiring Soon"
          value={expiringCount}
          icon={AlertCircle}
          color="amber"
          highlight={expiringCount > 0}
        />
        <StatCard label="Expired" value={expiredCount} icon={XCircle} color="red" />
        <StatCard label="Total" value={totalLicenses} icon={Key} color="blue" />
      </div>

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
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
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

      <div className="bg-white rounded-xl border border-zinc-200/80 p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Runtime Licensing Decisions</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Traceability of entitlement/quota decisions sent by Orchestrators.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
              <Activity className="h-3.5 w-3.5" />
              {runtimeAllowedCount} allowed
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              {runtimeBlockedCount} blocked
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          <Select value={runtimeTenantId} onValueChange={setRuntimeTenantId}>
            <SelectTrigger>
              <SelectValue placeholder="Select tenant" />
            </SelectTrigger>
            <SelectContent>
              {runtimeTenantOptions.length === 0 ? (
                <SelectItem value="tenant-unavailable" disabled>
                  No tenant available
                </SelectItem>
              ) : (
                runtimeTenantOptions.map((option) => (
                  <SelectItem key={option.tenantId} value={option.tenantId}>
                    {option.tenantName}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Select value={runtimeDecisionType} onValueChange={setRuntimeDecisionType}>
            <SelectTrigger>
              <SelectValue placeholder="All decision types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All decision types</SelectItem>
              <SelectItem value="entitlement_check">Entitlement Check</SelectItem>
              <SelectItem value="quota_check">Quota Check</SelectItem>
              <SelectItem value="quota_consume">Quota Consume</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Resource type (e.g. runs_per_month)"
            value={runtimeResourceType}
            onChange={(event) => setRuntimeResourceType(event.target.value)}
          />

          <Button
            variant="outline"
            onClick={() => void loadRuntimeDecisions()}
            disabled={runtimeLoading || !runtimeTenantId}
          >
            {runtimeLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh decisions
          </Button>
        </div>

        {!runtimeTenantId ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
            Select a tenant to inspect runtime license traceability.
          </div>
        ) : runtimeLoading ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading runtime decisions for {runtimeSelectedTenantName}...
          </div>
        ) : runtimeDecisions.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
            No runtime decisions found with current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="text-left py-2 pr-3">Timestamp</th>
                  <th className="text-left py-2 pr-3">Decision</th>
                  <th className="text-left py-2 pr-3">Resource</th>
                  <th className="text-left py-2 pr-3">State</th>
                  <th className="text-left py-2 pr-3">Usage</th>
                  <th className="text-left py-2 pr-3">Result</th>
                  <th className="text-left py-2 pr-0">Reason</th>
                </tr>
              </thead>
              <tbody>
                {runtimeDecisions.slice(0, 80).map((decision) => (
                  <tr key={decision.id} className="border-b border-zinc-100 last:border-0">
                    <td className="py-2.5 pr-3 text-zinc-600">
                      {new Date(decision.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3 text-zinc-900">
                      {decisionTypeLabels[decision.decisionType]}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-zinc-700">
                      {decision.resourceType}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        {decision.state || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-zinc-600">
                      {decision.projected}
                      {decision.limit !== null ? ` / ${decision.limit}` : ' / unlimited'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          decision.allowed
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {decision.allowed ? 'allowed' : 'blocked'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-0 text-zinc-600">{decision.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <Loader2 className="h-8 w-8 text-zinc-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-zinc-500">Loading licenses...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLicenses.map((license) => {
            const daysRemaining = getDaysRemaining(license.validUntil);
            const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 30;
            const status = statusConfig[license.status] || statusConfig.active;
            const StatusIcon = status.icon;
            const type = typeConfig[license.type] || typeConfig.standard;
            const isActionPending = actionLicenseId === license.id;

            return (
              <div
                key={license.id}
                className="bg-white rounded-xl border border-zinc-200/80 p-5 hover:border-zinc-300 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="h-12 w-12 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <Key className="h-6 w-6 text-zinc-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3 className="font-semibold text-zinc-900">{license.tenantName}</h3>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${type.bg} ${type.text}`}
                        >
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
                            {license.features.maxBots === -1
                              ? 'Unlimited'
                              : license.features.maxBots}{' '}
                            bots
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Cpu className="h-4 w-4 text-zinc-400" />
                          <span>
                            {license.features.maxRunners === -1
                              ? 'Unlimited'
                              : license.features.maxRunners}{' '}
                            runners
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
                      <Button
                        size="sm"
                        onClick={() => void handleRenewLicense(license)}
                        disabled={isActionPending}
                      >
                        {isActionPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Renew
                      </Button>
                    )}
                    {license.status === 'expired' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleReactivateLicense(license)}
                        disabled={isActionPending}
                      >
                        {isActionPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Reactivate
                      </Button>
                    )}
                    {license.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => void handleRevokeLicense(license)}
                        disabled={isActionPending}
                      >
                        {isActionPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : null}
                        Revoke
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filteredLicenses.length === 0 && (
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center mt-4">
          <Key className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-900">No licenses found</p>
          <p className="text-sm text-zinc-500 mt-1">Try adjusting your filters.</p>
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
    <div
      className={`rounded-xl border p-4 ${highlight ? 'border-amber-200 bg-amber-50/30' : 'border-zinc-200/80 bg-white'}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`h-8 w-8 rounded-lg ${colorClasses[color]} flex items-center justify-center`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={`text-2xl font-semibold ${highlight ? 'text-amber-700' : 'text-zinc-900'}`}>
        {value}
      </p>
      <p className="text-sm text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}
