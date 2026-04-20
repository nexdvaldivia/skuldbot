'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { useRuns, useCancelRun } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import { Play, StopCircle, RefreshCw, Filter } from 'lucide-react';
import Link from 'next/link';

export default function RunsPage() {
  const { data: runs, isLoading, refetch } = useRuns();
  const cancelMutation = useCancelRun();
  const { toast } = useToast();

  const handleCancel = async (id: string) => {
    if (confirm('Are you sure you want to cancel this run?')) {
      try {
        await cancelMutation.mutateAsync(id);
        toast({
          variant: 'success',
          title: 'Run cancelled',
          description: 'The run has been cancelled successfully.',
        });
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
      description: 'Run list has been refreshed.',
    });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Runs</h1>
          <p className="text-muted-foreground mt-1">Monitor bot executions</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
      </div>

      {/* Runs table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : runs?.length === 0 ? (
            <div className="text-center py-12">
              <Play className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">No runs yet</h3>
              <p className="text-muted-foreground mt-1">
                Create a schedule or trigger a bot manually to see runs here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Bot</th>
                    <th>Status</th>
                    <th>Trigger</th>
                    <th>Runner</th>
                    <th>Duration</th>
                    <th>Started</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs?.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <Link
                          href={`/runs/${run.id}`}
                          className="text-primary hover:text-primary/80 font-mono text-sm transition-colors"
                        >
                          {run.id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={`/bots/${run.botId}`}
                          className="text-foreground hover:text-primary transition-colors"
                        >
                          {run.botId}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="text-muted-foreground text-sm">
                        {run.trigger}
                      </td>
                      <td className="text-muted-foreground text-sm">
                        {run.runnerId ? (
                          <Link
                            href={`/runners/${run.runnerId}`}
                            className="hover:text-primary transition-colors"
                          >
                            {run.runnerId.slice(0, 8)}...
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="text-muted-foreground text-sm">
                        {run.durationMs ? formatDuration(run.durationMs) : '-'}
                      </td>
                      <td className="text-muted-foreground text-sm">
                        {run.startedAt
                          ? formatRelativeTime(run.startedAt)
                          : formatRelativeTime(run.createdAt)}
                      </td>
                      <td>
                        {(run.status === 'pending' ||
                          run.status === 'queued' ||
                          run.status === 'running') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(run.id)}
                            className="hover:bg-destructive/10"
                          >
                            <StopCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
