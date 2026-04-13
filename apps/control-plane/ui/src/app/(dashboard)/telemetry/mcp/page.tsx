'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Loader2,
  RefreshCw,
  Server,
  Bot,
  DollarSign,
  Download,
  ShieldCheck,
  FileText,
} from 'lucide-react';
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
  mcpApi,
  tenantsApi,
  type Tenant,
  type MCPBotUsage,
  type MCPTenantUsageSummary,
  type MCPActiveRunnersSummary,
  type MCPMarketplaceSubscription,
} from '@/lib/api';
import { toast } from '@/hooks/use-toast';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function metricKey(metric: string): string {
  return metric.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function getMetricValue(metrics: Record<string, number>, candidates: string[]): number {
  const entries = Object.entries(metrics);
  for (const candidate of candidates) {
    const candidateKey = metricKey(candidate);
    const match = entries.find(([key]) => metricKey(key) === candidateKey);
    if (match) {
      return Number(match[1] || 0);
    }
  }
  return 0;
}

function totalUsageUnits(botUsage: MCPBotUsage): number {
  return Object.values(botUsage.usage.metrics).reduce(
    (sum, quantity) => sum + Number(quantity || 0),
    0,
  );
}

function escapeCsv(value: unknown): string {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeFileSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function MCPTelemetryPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [period, setPeriod] = useState(currentPeriod());
  const [botFilter, setBotFilter] = useState('all');
  const [runnerFilter, setRunnerFilter] = useState('all');
  const [usageSummary, setUsageSummary] = useState<MCPTenantUsageSummary | null>(null);
  const [activeRunners, setActiveRunners] = useState<MCPActiveRunnersSummary | null>(null);
  const [subscriptions, setSubscriptions] = useState<MCPMarketplaceSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'evidence' | 'pdf' | null>(null);

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const data = await tenantsApi.list();
        setTenants(data);
        if (data.length > 0) {
          setTenantId((current) => current || data[0].id);
        }
      } catch (error) {
        setTenants([]);
        toast({
          variant: 'error',
          title: 'Failed to load tenants',
          description: error instanceof Error ? error.message : 'Could not fetch tenants from API.',
        });
      }
    };

    void loadTenants();
  }, []);

  const loadTelemetry = useCallback(
    async (isManualRefresh = false) => {
      if (!tenantId) {
        setLoading(false);
        return;
      }

      try {
        if (isManualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const [usageData, runnersData, subscriptionsData] = await Promise.all([
          mcpApi.getTenantUsageSummary(tenantId, period),
          mcpApi.getActiveRunners(tenantId),
          mcpApi.listSubscribedBots(tenantId),
        ]);

        setUsageSummary(usageData);
        setActiveRunners(runnersData);
        setSubscriptions(subscriptionsData);
      } catch (error) {
        setUsageSummary(null);
        setActiveRunners(null);
        setSubscriptions([]);
        toast({
          variant: 'error',
          title: 'Failed to load MCP telemetry',
          description:
            error instanceof Error
              ? error.message
              : 'Could not fetch MCP telemetry for selected filters.',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, period],
  );

  useEffect(() => {
    void loadTelemetry(false);
  }, [loadTelemetry]);

  useEffect(() => {
    setBotFilter('all');
    setRunnerFilter('all');
  }, [tenantId]);

  const botLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const subscription of subscriptions) {
      map.set(subscription.botId, subscription.botName || subscription.botId);
    }
    return map;
  }, [subscriptions]);

  const botOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const bot of usageSummary?.botUsage || []) {
      ids.add(bot.botId);
    }
    for (const subscription of subscriptions) {
      ids.add(subscription.botId);
    }

    return Array.from(ids).map((id) => ({
      id,
      label: botLabelMap.get(id) || id,
    }));
  }, [botLabelMap, subscriptions, usageSummary]);

  const filteredBotUsage = useMemo(() => {
    const rows = usageSummary?.botUsage || [];
    if (botFilter === 'all') {
      return rows;
    }
    return rows.filter((row) => row.botId === botFilter);
  }, [botFilter, usageSummary]);

  const runnerOptions = useMemo(() => {
    return (activeRunners?.activeRunners || []).map((runner) => ({
      id: runner.runnerId,
      label: `${runner.runnerId.slice(0, 8)} (${runner.type})`,
    }));
  }, [activeRunners]);

  const filteredRunners = useMemo(() => {
    const rows = activeRunners?.activeRunners || [];
    if (runnerFilter === 'all') {
      return rows;
    }
    return rows.filter((row) => row.runnerId === runnerFilter);
  }, [activeRunners, runnerFilter]);

  const usageTotals = useMemo(() => {
    return filteredBotUsage.reduce(
      (acc, row) => {
        acc.units += totalUsageUnits(row);
        acc.billable += Number(row.willBeBilled || 0);
        return acc;
      },
      { units: 0, billable: 0 },
    );
  }, [filteredBotUsage]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === tenantId) || null,
    [tenantId, tenants],
  );

  const reportFileStem = useMemo(() => {
    const tenantPart = normalizeFileSlug(selectedTenant?.name || tenantId || 'tenant');
    const periodPart = normalizeFileSlug(period || currentPeriod());
    return `mcp-telemetry-${tenantPart}-${periodPart}`;
  }, [period, selectedTenant, tenantId]);

  const handleExportCsv = async () => {
    if (!tenantId) {
      toast({
        variant: 'warning',
        title: 'Select tenant first',
        description: 'Tenant is required to export telemetry.',
      });
      return;
    }

    try {
      setExporting('csv');
      const lines: string[] = [];
      const generatedAt = new Date().toISOString();

      lines.push('Skuld MCP Telemetry Export');
      lines.push(`Generated At,${escapeCsv(generatedAt)}`);
      lines.push(`Tenant Id,${escapeCsv(tenantId)}`);
      lines.push(`Tenant Name,${escapeCsv(selectedTenant?.name || '')}`);
      lines.push(`Period,${escapeCsv(period)}`);
      lines.push(`Bot Filter,${escapeCsv(botFilter)}`);
      lines.push(`Runner Filter,${escapeCsv(runnerFilter)}`);
      lines.push(
        `Source Tools,${escapeCsv(
          ['get_tenant_usage_summary', 'get_active_runners', 'list_subscribed_bots'].join('|'),
        )}`,
      );
      lines.push('');

      lines.push('Bot Metering');
      lines.push(
        [
          'botId',
          'botLabel',
          'units',
          'claimsCompleted',
          'apiCalls',
          'usageBased',
          'callBased',
          'monthlyMinimum',
          'billable',
        ].join(','),
      );
      for (const botUsage of filteredBotUsage) {
        const claims = getMetricValue(botUsage.usage.metrics, ['claimsCompleted']);
        const apiCalls = getMetricValue(botUsage.usage.metrics, ['apiCalls']);
        lines.push(
          [
            botUsage.botId,
            botLabelMap.get(botUsage.botId) || botUsage.botId,
            totalUsageUnits(botUsage),
            claims,
            apiCalls,
            botUsage.usage.costs.usageBased,
            botUsage.usage.costs.callBased,
            botUsage.usage.costs.monthlyMinimum,
            botUsage.willBeBilled,
          ]
            .map((cell) => escapeCsv(cell))
            .join(','),
        );
      }
      lines.push('');

      lines.push('Runner Activity');
      lines.push('runnerId,type,status,lastHeartbeat,orchestratorId');
      for (const runner of filteredRunners) {
        lines.push(
          [
            runner.runnerId,
            runner.type,
            runner.status,
            runner.timestamp,
            runner.orchestratorId || '',
          ]
            .map((cell) => escapeCsv(cell))
            .join(','),
        );
      }
      lines.push('');

      lines.push('Marketplace Subscriptions');
      lines.push('subscriptionId,botId,botName,pricingPlan,status,downloadCount,subscribedAt');
      for (const subscription of subscriptions) {
        lines.push(
          [
            subscription.subscriptionId,
            subscription.botId,
            subscription.botName || '',
            subscription.pricingPlan,
            subscription.status,
            subscription.downloadCount,
            subscription.subscribedAt || '',
          ]
            .map((cell) => escapeCsv(cell))
            .join(','),
        );
      }

      downloadFile(`${reportFileStem}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
      toast({
        variant: 'success',
        title: 'CSV exported',
        description: `${reportFileStem}.csv generated successfully.`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'CSV export failed',
        description: error instanceof Error ? error.message : 'Could not export telemetry CSV.',
      });
    } finally {
      setExporting(null);
    }
  };

  const handleExportEvidence = async () => {
    if (!tenantId) {
      toast({
        variant: 'warning',
        title: 'Select tenant first',
        description: 'Tenant is required to export evidence package.',
      });
      return;
    }

    try {
      setExporting('evidence');
      const generatedAt = new Date().toISOString();
      const evidencePayload = {
        evidenceId: crypto.randomUUID(),
        generatedAt,
        route: '/telemetry/mcp',
        tenant: {
          id: tenantId,
          name: selectedTenant?.name || null,
        },
        filters: {
          period,
          bot: botFilter,
          runner: runnerFilter,
        },
        provenance: {
          source: 'control-plane-ui',
          mcpTools: ['get_tenant_usage_summary', 'get_active_runners', 'list_subscribed_bots'],
        },
        summary: {
          billable: usageTotals.billable,
          usageUnits: usageTotals.units,
          activeRunners: filteredRunners.length,
          marketplaceSubscriptions: subscriptions.length,
        },
        datasets: {
          usageSummary: usageSummary,
          filteredBotUsage,
          filteredRunners,
          marketplaceSubscriptions: subscriptions,
        },
      };

      const canonical = JSON.stringify(evidencePayload);
      const digest = await sha256(canonical);
      const evidencePackage = {
        ...evidencePayload,
        integrity: {
          algorithm: 'SHA-256',
          digest,
          sourceBytes: canonical.length,
        },
      };

      downloadFile(
        `${reportFileStem}-evidence.json`,
        JSON.stringify(evidencePackage, null, 2),
        'application/json;charset=utf-8',
      );
      toast({
        variant: 'success',
        title: 'Evidence exported',
        description: `${reportFileStem}-evidence.json generated with SHA-256 integrity.`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Evidence export failed',
        description: error instanceof Error ? error.message : 'Could not export evidence package.',
      });
    } finally {
      setExporting(null);
    }
  };

  const handlePrintPdf = () => {
    if (!tenantId) {
      toast({
        variant: 'warning',
        title: 'Select tenant first',
        description: 'Tenant is required to generate printable report.',
      });
      return;
    }

    try {
      setExporting('pdf');
      const generatedAt = new Date().toISOString();
      const win = window.open('', '_blank', 'noopener,noreferrer');
      if (!win) {
        throw new Error('Popup blocked by browser. Allow popups for this site.');
      }

      const rowsHtml = filteredBotUsage
        .map((botUsage) => {
          const claims = getMetricValue(botUsage.usage.metrics, ['claimsCompleted']);
          const apiCalls = getMetricValue(botUsage.usage.metrics, ['apiCalls']);
          return `<tr>
            <td>${escapeHtml(botLabelMap.get(botUsage.botId) || botUsage.botId)}</td>
            <td>${escapeHtml(totalUsageUnits(botUsage).toLocaleString())}</td>
            <td>${escapeHtml(claims.toLocaleString())}</td>
            <td>${escapeHtml(apiCalls.toLocaleString())}</td>
            <td>$${escapeHtml(Number(botUsage.willBeBilled || 0).toLocaleString())}</td>
          </tr>`;
        })
        .join('');

      const runnersHtml = filteredRunners
        .map(
          (runner) => `<tr>
            <td>${escapeHtml(runner.runnerId)}</td>
            <td>${escapeHtml(runner.type)}</td>
            <td>${escapeHtml(runner.status)}</td>
            <td>${escapeHtml(new Date(runner.timestamp).toLocaleString())}</td>
          </tr>`,
        )
        .join('');

      const subscriptionsHtml = subscriptions
        .map(
          (subscription) => `<tr>
            <td>${escapeHtml(subscription.botName || subscription.botId)}</td>
            <td>${escapeHtml(subscription.pricingPlan)}</td>
            <td>${escapeHtml(String(subscription.downloadCount))}</td>
            <td>${escapeHtml(subscription.status)}</td>
          </tr>`,
        )
        .join('');

      win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Skuld MCP Telemetry Report</title>
    <style>
      body { font-family: Arial, sans-serif; color: #18181b; margin: 24px; }
      h1 { font-size: 20px; margin: 0 0 12px; }
      h2 { font-size: 14px; margin: 20px 0 8px; }
      .meta { font-size: 12px; color: #52525b; margin-bottom: 16px; }
      .kpi { display: inline-block; margin-right: 16px; font-size: 12px; color: #27272a; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #e4e4e7; padding: 6px 8px; text-align: left; }
      th { background: #f4f4f5; }
      .trace { margin-top: 18px; font-size: 11px; color: #71717a; }
      @page { margin: 16mm; }
    </style>
  </head>
  <body>
    <h1>Skuld MCP Telemetry Report</h1>
    <div class="meta">
      Tenant: ${escapeHtml(selectedTenant?.name || tenantId)} (${escapeHtml(tenantId)})<br />
      Period: ${escapeHtml(period)} · Bot filter: ${escapeHtml(botFilter)} · Runner filter: ${escapeHtml(runnerFilter)}<br />
      Generated at: ${escapeHtml(generatedAt)}
    </div>
    <div class="kpi">Billable: $${escapeHtml(usageTotals.billable.toLocaleString())}</div>
    <div class="kpi">Usage units: ${escapeHtml(usageTotals.units.toLocaleString())}</div>
    <div class="kpi">Active runners: ${escapeHtml(String(filteredRunners.length))}</div>
    <div class="kpi">Marketplace subscriptions: ${escapeHtml(String(subscriptions.length))}</div>

    <h2>Bot Metering</h2>
    <table>
      <thead><tr><th>Bot</th><th>Units</th><th>Claims</th><th>API Calls</th><th>Billable</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="5">No bot usage for selected filters.</td></tr>'}</tbody>
    </table>

    <h2>Runner Activity</h2>
    <table>
      <thead><tr><th>Runner ID</th><th>Type</th><th>Status</th><th>Last Heartbeat</th></tr></thead>
      <tbody>${runnersHtml || '<tr><td colspan="4">No active runners for selected filters.</td></tr>'}</tbody>
    </table>

    <h2>Marketplace Subscriptions</h2>
    <table>
      <thead><tr><th>Bot</th><th>Plan</th><th>Downloads</th><th>Status</th></tr></thead>
      <tbody>${subscriptionsHtml || '<tr><td colspan="4">No active marketplace subscriptions.</td></tr>'}</tbody>
    </table>

    <div class="trace">
      Traceability: source route /telemetry/mcp · tools get_tenant_usage_summary|get_active_runners|list_subscribed_bots
    </div>
  </body>
</html>`);
      win.document.close();
      win.focus();
      win.print();
      toast({
        variant: 'success',
        title: 'Printable report ready',
        description: 'Use "Save as PDF" from your print dialog.',
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Print/PDF failed',
        description:
          error instanceof Error ? error.message : 'Could not generate printable report.',
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">MCP Telemetry</h1>
          <p className="mt-1 text-zinc-500">
            Usage, runners and marketplace subscriptions from MCP servers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void loadTelemetry(true)}
            disabled={loading || refreshing || !tenantId}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleExportCsv()}
            disabled={loading || exporting !== null || !tenantId}
          >
            {exporting === 'csv' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleExportEvidence()}
            disabled={loading || exporting !== null || !tenantId}
          >
            {exporting === 'evidence' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Evidence JSON
          </Button>
          <Button
            variant="outline"
            onClick={handlePrintPdf}
            disabled={loading || exporting !== null || !tenantId}
          >
            {exporting === 'pdf' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Print / PDF
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Tenant</p>
          <Select
            value={tenantId || 'none'}
            onValueChange={(value) => setTenantId(value === 'none' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select tenant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select tenant</SelectItem>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Period</p>
          <Input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value || currentPeriod())}
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Bot</p>
          <Select value={botFilter} onValueChange={setBotFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All bots" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All bots</SelectItem>
              {botOptions.map((bot) => (
                <SelectItem key={bot.id} value={bot.id}>
                  {bot.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Runner</p>
          <Select value={runnerFilter} onValueChange={setRunnerFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All runners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All runners</SelectItem>
              {runnerOptions.map((runner) => (
                <SelectItem key={runner.id} value={runner.id}>
                  {runner.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Billable"
          value={`$${usageTotals.billable.toLocaleString()}`}
          icon={DollarSign}
          color="emerald"
        />
        <StatCard
          label="Usage Units"
          value={usageTotals.units.toLocaleString()}
          icon={Activity}
          color="blue"
        />
        <StatCard
          label="Active Runners"
          value={filteredRunners.length}
          icon={Server}
          color="amber"
        />
        <StatCard
          label="Bot Subscriptions"
          value={subscriptions.length}
          icon={Bot}
          color="emerald"
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-zinc-200/80 bg-white px-5 py-14 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">Loading MCP telemetry...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section className="xl:col-span-2 overflow-hidden rounded-xl border border-zinc-200/80 bg-white">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="font-medium text-zinc-900">Bot Metering</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Period {usageSummary?.period || period} · {filteredBotUsage.length} bot(s)
              </p>
            </div>

            <div className="hidden grid-cols-12 gap-4 border-b border-zinc-100 bg-zinc-50/60 px-5 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 lg:grid">
              <div className="col-span-4">Bot</div>
              <div className="col-span-2 text-right">Units</div>
              <div className="col-span-2 text-right">Claims</div>
              <div className="col-span-2 text-right">API Calls</div>
              <div className="col-span-2 text-right">Billable</div>
            </div>

            <div className="divide-y divide-zinc-100">
              {filteredBotUsage.map((botUsage) => {
                const claims = getMetricValue(botUsage.usage.metrics, ['claimsCompleted']);
                const apiCalls = getMetricValue(botUsage.usage.metrics, ['apiCalls']);
                return (
                  <div key={botUsage.botId}>
                    <div className="hidden grid-cols-12 gap-4 px-5 py-4 lg:grid">
                      <div className="col-span-4">
                        <p className="font-medium text-zinc-900">
                          {botLabelMap.get(botUsage.botId) || botUsage.botId}
                        </p>
                        <p className="text-xs text-zinc-500">{botUsage.botId}</p>
                      </div>
                      <div className="col-span-2 text-right text-sm text-zinc-700">
                        {totalUsageUnits(botUsage).toLocaleString()}
                      </div>
                      <div className="col-span-2 text-right text-sm text-zinc-700">
                        {claims.toLocaleString()}
                      </div>
                      <div className="col-span-2 text-right text-sm text-zinc-700">
                        {apiCalls.toLocaleString()}
                      </div>
                      <div className="col-span-2 text-right text-sm font-semibold text-zinc-900">
                        ${Number(botUsage.willBeBilled || 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="space-y-2 px-4 py-4 lg:hidden">
                      <p className="font-medium text-zinc-900">
                        {botLabelMap.get(botUsage.botId) || botUsage.botId}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                        <span>Units: {totalUsageUnits(botUsage).toLocaleString()}</span>
                        <span>Claims: {claims.toLocaleString()}</span>
                        <span>API calls: {apiCalls.toLocaleString()}</span>
                        <span className="font-semibold text-zinc-900">
                          Billable: ${Number(botUsage.willBeBilled || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredBotUsage.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  No bot usage for selected filters.
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="font-medium text-zinc-900">Runner Activity</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {filteredRunners.length} active runner(s)
              </p>
            </div>
            <div className="divide-y divide-zinc-100">
              {filteredRunners.map((runner) => (
                <div key={runner.runnerId} className="px-5 py-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-medium text-zinc-900">{runner.runnerId.slice(0, 12)}...</p>
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                        runner.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : runner.status === 'idle'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {runner.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">Type: {runner.type}</p>
                  <p className="text-xs text-zinc-500">
                    Last heartbeat: {new Date(runner.timestamp).toLocaleString()}
                  </p>
                  {runner.orchestratorId && (
                    <p className="text-xs text-zinc-500">Orchestrator: {runner.orchestratorId}</p>
                  )}
                </div>
              ))}
              {filteredRunners.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  No active runners for selected filters.
                </div>
              )}
            </div>
          </section>

          <section className="xl:col-span-3 overflow-hidden rounded-xl border border-zinc-200/80 bg-white">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="font-medium text-zinc-900">Marketplace Subscriptions</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {subscriptions.length} active subscription(s)
              </p>
            </div>
            <div className="divide-y divide-zinc-100">
              {subscriptions.map((subscription) => (
                <div
                  key={subscription.subscriptionId}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-zinc-900">
                      {subscription.botName || subscription.botId}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {subscription.pricingPlan} · downloads {subscription.downloadCount}
                    </p>
                  </div>
                  <span className="inline-flex rounded px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700">
                    {subscription.status}
                  </span>
                </div>
              ))}
              {subscriptions.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  No active marketplace subscriptions.
                </div>
              )}
            </div>
          </section>
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
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: 'emerald' | 'blue' | 'amber';
}) {
  const palette = {
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      icon: 'text-emerald-600',
    },
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      icon: 'text-blue-600',
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      icon: 'text-amber-600',
    },
  }[color];

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500">{label}</span>
        <span className={`rounded-md p-2 ${palette.bg}`}>
          <Icon className={`h-4 w-4 ${palette.icon}`} />
        </span>
      </div>
      <p className={`text-xl font-semibold ${palette.text}`}>{value}</p>
    </div>
  );
}
