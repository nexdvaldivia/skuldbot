'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Download,
  FileCheck2,
  Filter,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuditLogs, useBots, useRunners, useRuns } from '@/hooks/use-api';
import { formatDateTime, formatDuration } from '@/lib/utils';
import type { AuditLog, Run } from '@/lib/api';

function escapeCsv(value: unknown): string {
  const raw = String(value ?? '');
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
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
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function runTimestamp(run: Run): string {
  return run.startedAt || run.createdAt;
}

function matchesDateRange(timestamp: string, startDate: string, endDate: string): boolean {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  if (startDate) {
    const start = new Date(`${startDate}T00:00:00.000`);
    if (date < start) {
      return false;
    }
  }

  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`);
    if (date > end) {
      return false;
    }
  }

  return true;
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function TraceabilityPage() {
  const [search, setSearch] = useState('');
  const [botFilter, setBotFilter] = useState('all');
  const [runnerFilter, setRunnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'evidence' | 'pdf' | null>(null);

  const { toast } = useToast();

  const {
    data: bots = [],
    isLoading: botsLoading,
    error: botsError,
    refetch: refetchBots,
    isFetching: botsFetching,
  } = useBots();
  const {
    data: runners = [],
    isLoading: runnersLoading,
    error: runnersError,
    refetch: refetchRunners,
    isFetching: runnersFetching,
  } = useRunners();
  const {
    data: runs = [],
    isLoading: runsLoading,
    error: runsError,
    refetch: refetchRuns,
    isFetching: runsFetching,
  } = useRuns();
  const {
    data: auditData,
    isLoading: auditLoading,
    error: auditError,
    refetch: refetchAudit,
    isFetching: auditFetching,
  } = useAuditLogs({ limit: 250 });

  const allAuditLogs = auditData?.logs || [];
  const loading = botsLoading || runnersLoading || runsLoading || auditLoading;
  const refreshing = botsFetching || runnersFetching || runsFetching || auditFetching;
  const hasError = Boolean(botsError || runnersError || runsError || auditError);

  const botNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bot of bots) {
      map.set(bot.id, bot.name || bot.id);
    }
    return map;
  }, [bots]);

  const runnerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const runner of runners) {
      map.set(runner.id, runner.name || runner.id);
    }
    return map;
  }, [runners]);

  const runStatuses = useMemo(() => {
    return Array.from(new Set(runs.map((run) => run.status))).sort();
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return runs.filter((run) => {
      if (botFilter !== 'all' && run.botId !== botFilter) {
        return false;
      }

      if (runnerFilter === 'unassigned' && run.runnerId) {
        return false;
      }

      if (
        runnerFilter !== 'all' &&
        runnerFilter !== 'unassigned' &&
        run.runnerId !== runnerFilter
      ) {
        return false;
      }

      if (statusFilter !== 'all' && run.status !== statusFilter) {
        return false;
      }

      if (!matchesDateRange(runTimestamp(run), startDate, endDate)) {
        return false;
      }

      if (!term) {
        return true;
      }

      const botName = botNameById.get(run.botId) || '';
      const runnerName = run.runnerId ? runnerNameById.get(run.runnerId) || '' : '';
      const searchable = [
        run.id,
        run.botId,
        botName,
        run.runnerId || '',
        runnerName,
        run.status,
        run.trigger,
        run.error || '',
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [
    botFilter,
    botNameById,
    endDate,
    runnerFilter,
    runnerNameById,
    runs,
    search,
    startDate,
    statusFilter,
  ]);

  const filteredAuditLogs = useMemo(() => {
    const term = search.trim().toLowerCase();

    return allAuditLogs.filter((log) => {
      if (!matchesDateRange(log.timestamp, startDate, endDate)) {
        return false;
      }

      if (botFilter !== 'all' && !(log.resourceType === 'bot' && log.resourceId === botFilter)) {
        return false;
      }

      if (
        runnerFilter !== 'all' &&
        runnerFilter !== 'unassigned' &&
        !(log.resourceType === 'runner' && log.resourceId === runnerFilter)
      ) {
        return false;
      }

      if (!term) {
        return true;
      }

      const searchable = [
        log.id,
        log.category,
        log.action,
        log.result,
        log.userEmail || '',
        log.resourceType || '',
        log.resourceId || '',
        log.errorMessage || '',
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [allAuditLogs, botFilter, endDate, runnerFilter, search, startDate]);

  const runSummary = useMemo(() => {
    const total = filteredRuns.length;
    const success = filteredRuns.filter((run) => run.status === 'success').length;
    const failed = filteredRuns.filter((run) => run.status === 'failed').length;
    const attributed = filteredRuns.filter((run) => run.runnerId).length;

    const avgDurationMs = filteredRuns.reduce((sum, run) => {
      return sum + (run.durationMs || 0);
    }, 0);

    return {
      total,
      success,
      failed,
      attributed,
      successRate: total > 0 ? Math.round((success / total) * 100) : 0,
      attributionRate: total > 0 ? Math.round((attributed / total) * 100) : 0,
      avgDuration: total > 0 ? formatDuration(Math.round(avgDurationMs / total)) : '-',
    };
  }, [filteredRuns]);

  const reportStem = useMemo(() => {
    const suffix = new Date().toISOString().slice(0, 10);
    return `traceability-${normalizeSlug(suffix)}`;
  }, []);

  const handleRefresh = async () => {
    const [botsResult, runnersResult, runsResult, auditResult] = await Promise.all([
      refetchBots(),
      refetchRunners(),
      refetchRuns(),
      refetchAudit(),
    ]);

    if (botsResult.error || runnersResult.error || runsResult.error || auditResult.error) {
      toast({
        variant: 'destructive',
        title: 'Refresh failed',
        description: 'Traceability data could not be refreshed from one or more modules.',
      });
      return;
    }

    toast({
      variant: 'success',
      title: 'Traceability refreshed',
      description: 'Runs, bots, runners, and audit events are up to date.',
    });
  };

  const handleExportCsv = async () => {
    try {
      setExporting('csv');
      const lines: string[] = [];
      lines.push('SkuldBot Orchestrator Traceability Export');
      lines.push(`Generated At,${escapeCsv(new Date().toISOString())}`);
      lines.push(`Search,${escapeCsv(search)}`);
      lines.push(`Bot Filter,${escapeCsv(botFilter)}`);
      lines.push(`Runner Filter,${escapeCsv(runnerFilter)}`);
      lines.push(`Status Filter,${escapeCsv(statusFilter)}`);
      lines.push(`Start Date,${escapeCsv(startDate)}`);
      lines.push(`End Date,${escapeCsv(endDate)}`);
      lines.push('');

      lines.push('Runs');
      lines.push(
        [
          'runId',
          'timestamp',
          'botId',
          'botName',
          'runnerId',
          'runnerName',
          'status',
          'trigger',
          'durationMs',
          'error',
        ].join(','),
      );
      for (const run of filteredRuns) {
        lines.push(
          [
            run.id,
            runTimestamp(run),
            run.botId,
            botNameById.get(run.botId) || run.botId,
            run.runnerId || '',
            run.runnerId ? runnerNameById.get(run.runnerId) || run.runnerId : '',
            run.status,
            run.trigger,
            run.durationMs || '',
            run.error || '',
          ]
            .map((cell) => escapeCsv(cell))
            .join(','),
        );
      }
      lines.push('');

      lines.push('Audit');
      lines.push(
        'id,timestamp,category,action,result,userEmail,resourceType,resourceId,errorMessage',
      );
      for (const log of filteredAuditLogs) {
        lines.push(
          [
            log.id,
            log.timestamp,
            log.category,
            log.action,
            log.result,
            log.userEmail || '',
            log.resourceType || '',
            log.resourceId || '',
            log.errorMessage || '',
          ]
            .map((cell) => escapeCsv(cell))
            .join(','),
        );
      }

      downloadFile(`${reportStem}.csv`, lines.join('\n'), 'text/csv;charset=utf-8;');
      toast({
        variant: 'success',
        title: 'CSV exported',
        description: 'Traceability CSV was generated from live Orchestrator data.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'CSV export failed',
        description: error instanceof Error ? error.message : 'Unexpected export error.',
      });
    } finally {
      setExporting(null);
    }
  };

  const handleExportEvidence = async () => {
    try {
      setExporting('evidence');
      const payload = {
        generatedAt: new Date().toISOString(),
        scope: 'orchestrator.traceability',
        filters: {
          search,
          botFilter,
          runnerFilter,
          statusFilter,
          startDate,
          endDate,
        },
        summary: {
          runs: runSummary.total,
          success: runSummary.success,
          failed: runSummary.failed,
          successRate: runSummary.successRate,
          attributionRate: runSummary.attributionRate,
          auditEvents: filteredAuditLogs.length,
        },
        sources: ['runs:list', 'bots:list', 'runners:list', 'audit:list'],
        data: {
          runs: filteredRuns,
          audit: filteredAuditLogs,
        },
      };

      const canonical = JSON.stringify(payload);
      const checksum = await sha256(canonical);
      const envelope = {
        ...payload,
        integrity: {
          algorithm: 'SHA-256',
          digest: checksum,
        },
      };

      downloadFile(
        `${reportStem}.evidence.json`,
        JSON.stringify(envelope, null, 2),
        'application/json;charset=utf-8;',
      );

      toast({
        variant: 'success',
        title: 'Evidence exported',
        description: 'Evidence package includes cryptographic integrity hash.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Evidence export failed',
        description: error instanceof Error ? error.message : 'Unexpected export error.',
      });
    } finally {
      setExporting(null);
    }
  };

  const handlePrint = () => {
    setExporting('pdf');
    window.print();
    setTimeout(() => setExporting(null), 300);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Traceability</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Evidence of run execution, bot usage, runner attribution, and audit events per tenant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={exporting !== null || loading}
          >
            {exporting === 'csv' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleExportEvidence}
            disabled={exporting !== null || loading}
          >
            {exporting === 'evidence' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Export Evidence
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={exporting !== null || loading}>
            {exporting === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Print / PDF
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-brand-500" />
            Traceability Filters
          </CardTitle>
          <CardDescription>
            Filter by bot, runner, status and period. Same filters apply to runs and audit evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search run, bot, runner, action..."
            />

            <select
              value={botFilter}
              onChange={(event) => setBotFilter(event.target.value)}
              className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-brand-400 transition focus:ring-2"
            >
              <option value="all">All bots</option>
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
            </select>

            <select
              value={runnerFilter}
              onChange={(event) => setRunnerFilter(event.target.value)}
              className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-brand-400 transition focus:ring-2"
            >
              <option value="all">All runners</option>
              <option value="unassigned">Unassigned runs</option>
              {runners.map((runner) => (
                <option key={runner.id} value={runner.id}>
                  {runner.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-brand-400 transition focus:ring-2"
            >
              <option value="all">All statuses</option>
              {runStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading traceability data...
            </div>
          </CardContent>
        </Card>
      ) : hasError ? (
        <Card>
          <CardContent className="py-16">
            <div className="mx-auto max-w-xl text-center">
              <AlertTriangle className="mx-auto h-9 w-9 text-error-500" />
              <p className="mt-3 text-base font-semibold text-zinc-900">
                Could not load traceability data
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Verify Orchestrator API and RBAC permissions for runs, bots, runners and audit
                modules.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Filtered Runs" value={runSummary.total} icon={Activity} />
            <MetricCard
              title="Success Rate"
              value={`${runSummary.successRate}%`}
              icon={FileCheck2}
            />
            <MetricCard title="Failed Runs" value={runSummary.failed} icon={AlertTriangle} />
            <MetricCard title="Audit Events" value={filteredAuditLogs.length} icon={ShieldCheck} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Run Traceability</CardTitle>
                <CardDescription>
                  {filteredRuns.length} runs | Attribution {runSummary.attributionRate}% | Avg
                  duration {runSummary.avgDuration}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredRuns.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-zinc-500">
                    No runs match current filters.
                  </div>
                ) : (
                  <div className="max-h-[480px] overflow-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Run</th>
                          <th>Bot</th>
                          <th>Runner</th>
                          <th>Status</th>
                          <th>Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRuns.slice(0, 200).map((run) => (
                          <tr key={run.id}>
                            <td className="font-mono text-xs text-zinc-500">
                              {formatDateTime(runTimestamp(run))}
                            </td>
                            <td className="font-mono text-xs text-zinc-700">{run.id}</td>
                            <td>
                              <div className="flex flex-col">
                                <span className="text-zinc-900">
                                  {botNameById.get(run.botId) || run.botId}
                                </span>
                                <span className="text-xs text-zinc-500">{run.botId}</span>
                              </div>
                            </td>
                            <td>
                              {run.runnerId ? (
                                <div className="flex flex-col">
                                  <span className="text-zinc-900">
                                    {runnerNameById.get(run.runnerId) || run.runnerId}
                                  </span>
                                  <span className="text-xs text-zinc-500">{run.runnerId}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-500">Unassigned</span>
                              )}
                            </td>
                            <td>
                              <StatusBadge status={run.status} />
                            </td>
                            <td className="text-xs text-zinc-600">
                              {run.durationMs ? formatDuration(run.durationMs) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Audit Traceability</CardTitle>
                <CardDescription>
                  Security and operational actions linked to runtime resources.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredAuditLogs.length === 0 ? (
                  <p className="text-sm text-zinc-500">No audit events match current filters.</p>
                ) : (
                  <div className="max-h-[430px] space-y-3 overflow-auto pr-1">
                    {filteredAuditLogs.slice(0, 120).map((log) => (
                      <AuditLogItem
                        key={log.id}
                        log={log}
                        botName={log.resourceId ? botNameById.get(log.resourceId) : undefined}
                        runnerName={log.resourceId ? runnerNameById.get(log.resourceId) : undefined}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
        </div>
        <span className="rounded-xl border border-brand-100 bg-brand-50 p-2.5 text-brand-600">
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function AuditLogItem({
  log,
  botName,
  runnerName,
}: {
  log: AuditLog;
  botName?: string;
  runnerName?: string;
}) {
  const resourceLabel =
    log.resourceType === 'bot'
      ? botName || log.resourceId || 'bot'
      : log.resourceType === 'runner'
        ? runnerName || log.resourceId || 'runner'
        : log.resourceId || 'resource';

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {log.category}
          </p>
          <p className="text-sm font-medium text-zinc-900">{log.action}</p>
        </div>
        <StatusBadge
          status={
            log.result === 'success' ? 'success' : log.result === 'failure' ? 'failed' : 'paused'
          }
        />
      </div>
      <p className="mt-1 text-xs text-zinc-600">
        Actor: {log.userEmail || 'system'} | Resource: {resourceLabel}
      </p>
      <p className="mt-1 text-xs font-mono text-zinc-500">{formatDateTime(log.timestamp)}</p>
      {log.errorMessage && <p className="mt-1 text-xs text-error-600">{log.errorMessage}</p>}
    </div>
  );
}
