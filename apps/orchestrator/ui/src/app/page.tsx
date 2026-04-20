'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { useRunStats, useRunnerStats, useRuns, useBots } from '@/hooks/use-api';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import {
  Bot,
  Play,
  Server,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: runStats } = useRunStats();
  const { data: runnerStats } = useRunnerStats();
  const { data: runs } = useRuns();
  const { data: bots } = useBots();

  const recentRuns = runs?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your RPA automation</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Bots"
          value={bots?.length || 0}
          icon={Bot}
          color="primary"
        />
        <StatsCard
          title="Runs Today"
          value={runStats?.total || 0}
          icon={Play}
          color="secondary"
          subtitle={`${runStats?.running || 0} running`}
        />
        <StatsCard
          title="Success Rate"
          value={
            runStats?.total
              ? `${Math.round((runStats.success / runStats.total) * 100)}%`
              : '0%'
          }
          icon={TrendingUp}
          color="success"
        />
        <StatsCard
          title="Runners Online"
          value={`${runnerStats?.online || 0}/${runnerStats?.total || 0}`}
          icon={Server}
          color="warning"
          subtitle={`${runnerStats?.busy || 0} busy`}
        />
      </div>

      {/* Recent runs and quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent runs */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Runs</CardTitle>
            <Link
              href="/runs"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentRuns.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No runs yet. Create a schedule or trigger a bot manually.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Bot</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <Link
                            href={`/runs/${run.id}`}
                            className="text-foreground hover:text-primary transition-colors"
                          >
                            {run.botId}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="text-muted-foreground text-sm">
                          {run.durationMs ? formatDuration(run.durationMs) : '-'}
                        </td>
                        <td className="text-muted-foreground text-sm">
                          {formatRelativeTime(run.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick stats */}
        <Card>
          <CardHeader>
            <CardTitle>Run Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatRow
              icon={CheckCircle}
              label="Successful"
              value={runStats?.success || 0}
              color="text-success"
            />
            <StatRow
              icon={XCircle}
              label="Failed"
              value={runStats?.failed || 0}
              color="text-destructive"
            />
            <StatRow
              icon={Clock}
              label="Pending"
              value={runStats?.pending || 0}
              color="text-muted-foreground"
            />
            <StatRow
              icon={Play}
              label="Running"
              value={runStats?.running || 0}
              color="text-primary"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Stats card component
function StatsCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'primary' | 'secondary' | 'success' | 'warning';
  subtitle?: string;
}) {
  const colorStyles = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/20 text-secondary-foreground',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground/70 mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${colorStyles[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Stat row component
function StatRow({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Icon className={`h-5 w-5 ${color}`} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
