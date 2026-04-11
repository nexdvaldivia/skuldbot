'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { RunLogs } from '@/components/runs/run-logs';
import { useRun, useCancelRun } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime, formatDuration, formatDateTime } from '@/lib/utils';
import {
  ArrowLeft,
  Bot,
  Server,
  Clock,
  Calendar,
  StopCircle,
  RefreshCw,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

interface RunDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function RunDetailPage({ params }: RunDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: run, isLoading, refetch } = useRun(id);
  const cancelMutation = useCancelRun();
  const { toast } = useToast();

  const handleCancel = async () => {
    if (confirm('Are you sure you want to cancel this run?')) {
      try {
        await cancelMutation.mutateAsync(id);
        toast({
          variant: 'success',
          title: 'Run cancelled',
          description: 'The run has been cancelled successfully.',
        });
        refetch();
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to cancel run. Please try again.',
        });
      }
    }
  };

  const handleRefresh = () => {
    refetch();
    toast({
      title: 'Refreshed',
      description: 'Run details have been refreshed.',
    });
  };

  const isRunning =
    run?.status === 'pending' ||
    run?.status === 'queued' ||
    run?.status === 'running';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground">Run not found</h3>
        <p className="text-muted-foreground mt-1">
          The run you're looking for doesn't exist or has been deleted.
        </p>
        <Button className="mt-4" onClick={() => router.push('/runs')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Runs
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                Run {run.id.slice(0, 8)}...
              </h1>
              <StatusBadge status={run.status} />
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{run.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {isRunning && (
            <Button variant="destructive" onClick={handleCancel}>
              <StopCircle className="h-4 w-4 mr-2" />
              Cancel Run
            </Button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bot info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Bot</p>
                <Link
                  href={`/bots/${run.botId}`}
                  className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                >
                  {run.botId.slice(0, 12)}...
                  <ExternalLink className="h-3 w-3 inline ml-1" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Runner info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-secondary/20 rounded-lg">
                <Server className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Runner</p>
                {run.runnerId ? (
                  <Link
                    href={`/runners/${run.runnerId}`}
                    className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                  >
                    {run.runnerId.slice(0, 12)}...
                    <ExternalLink className="h-3 w-3 inline ml-1" />
                  </Link>
                ) : (
                  <p className="font-medium text-muted-foreground">Not assigned</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Duration */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <Clock className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-medium text-foreground">
                  {run.durationMs ? formatDuration(run.durationMs) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trigger */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <Play className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Trigger</p>
                <p className="font-medium text-foreground capitalize">
                  {run.trigger}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline and Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <TimelineItem
                icon={Calendar}
                label="Created"
                value={formatDateTime(run.createdAt)}
                subvalue={formatRelativeTime(run.createdAt)}
              />
              {run.startedAt && (
                <TimelineItem
                  icon={Play}
                  label="Started"
                  value={formatDateTime(run.startedAt)}
                  subvalue={formatRelativeTime(run.startedAt)}
                />
              )}
              {run.completedAt && (
                <TimelineItem
                  icon={
                    run.status === 'success'
                      ? CheckCircle
                      : run.status === 'failed'
                      ? XCircle
                      : AlertTriangle
                  }
                  label="Completed"
                  value={formatDateTime(run.completedAt)}
                  subvalue={formatRelativeTime(run.completedAt)}
                  iconColor={
                    run.status === 'success'
                      ? 'text-success'
                      : run.status === 'failed'
                      ? 'text-destructive'
                      : 'text-warning'
                  }
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Steps progress */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Execution Progress</CardTitle>
          </CardHeader>
          <CardContent>
            {run.stepsTotal ? (
              <div className="space-y-4">
                {/* Progress bar */}
                <div className="relative">
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{
                        width: `${
                          ((run.stepsCompleted || 0) / run.stepsTotal) * 100
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {run.stepsCompleted || 0} of {run.stepsTotal} steps completed
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-success">
                      {run.stepsCompleted || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-muted-foreground">
                      {run.stepsTotal - (run.stepsCompleted || 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">Remaining</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">
                      {run.stepsTotal}
                    </p>
                    <p className="text-sm text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Step information not available yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error message if failed */}
      {run.status === 'failed' && run.error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Error Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-destructive/10 rounded-lg text-destructive text-sm overflow-x-auto whitespace-pre-wrap">
              {run.error}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Real-time logs */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Logs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <RunLogs
            runId={id}
            maxHeight="600px"
            showStepProgress={true}
            onComplete={() => refetch()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Timeline Item Component
// ============================================

function TimelineItem({
  icon: Icon,
  label,
  value,
  subvalue,
  iconColor = 'text-muted-foreground',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subvalue?: string;
  iconColor?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium text-foreground">{value}</p>
        {subvalue && <p className="text-xs text-muted-foreground/70">{subvalue}</p>}
      </div>
    </div>
  );
}
