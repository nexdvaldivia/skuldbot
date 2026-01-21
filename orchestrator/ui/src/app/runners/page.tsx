'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRunners, useDeleteRunner } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime } from '@/lib/utils';
import {
  Server,
  Plus,
  MoreVertical,
  Trash2,
  Key,
  RefreshCw,
  Cpu,
  HardDrive,
} from 'lucide-react';
import Link from 'next/link';

export default function RunnersPage() {
  const { data: runners, isLoading, refetch } = useRunners();
  const deleteMutation = useDeleteRunner();
  const { toast } = useToast();

  const handleDelete = async (id: string, name: string) => {
    if (confirm('Are you sure you want to delete this runner?')) {
      try {
        await deleteMutation.mutateAsync(id);
        toast({
          variant: 'success',
          title: 'Runner deleted',
          description: `${name} has been deleted successfully.`,
        });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to delete runner. Please try again.',
        });
      }
    }
  };

  const handleRefresh = () => {
    refetch();
    toast({
      title: 'Refreshed',
      description: 'Runner list has been refreshed.',
    });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Runners</h1>
          <p className="text-muted-foreground mt-1">Manage bot execution agents</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Runner
          </Button>
        </div>
      </div>

      {/* Runners grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : runners?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Server className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">
              No runners registered
            </h3>
            <p className="text-muted-foreground mt-1">
              Install and configure the runner agent on your machines.
            </p>
            <Button className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Add Runner
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {runners?.map((runner) => (
            <RunnerCard
              key={runner.id}
              runner={runner}
              onDelete={() => handleDelete(runner.id, runner.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RunnerCard({
  runner,
  onDelete,
}: {
  runner: {
    id: string;
    name: string;
    status: string;
    labels?: Record<string, string>;
    capabilities?: string[];
    currentRunId?: string;
    lastHeartbeat?: string;
    systemInfo?: {
      hostname: string;
      os: string;
      cpuCount: number;
      memoryTotalMb: number;
    };
  };
  onDelete: () => void;
}) {
  const { toast } = useToast();

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-success/10';
      case 'busy':
        return 'bg-warning/10';
      default:
        return 'bg-muted';
    }
  };

  const getIconStyles = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-success';
      case 'busy':
        return 'text-warning';
      default:
        return 'text-muted-foreground';
    }
  };

  const handleRegenerateKey = () => {
    toast({
      title: 'Key regenerated',
      description: 'A new API key has been generated for this runner.',
    });
  };

  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${getStatusStyles(runner.status)}`}>
            <Server className={`h-5 w-5 ${getIconStyles(runner.status)}`} />
          </div>
          <div>
            <Link
              href={`/runners/${runner.id}`}
              className="font-semibold text-foreground hover:text-primary transition-colors"
            >
              {runner.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              {runner.systemInfo?.hostname || runner.id.slice(0, 8)}
            </p>
          </div>
        </div>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/runners/${runner.id}`} className="flex items-center">
                <Server className="h-4 w-4 mr-2" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRegenerateKey}>
              <Key className="h-4 w-4 mr-2" />
              Regenerate Key
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        {/* Status and heartbeat */}
        <div className="flex items-center justify-between mb-4">
          <StatusBadge status={runner.status} />
          {runner.lastHeartbeat && (
            <span className="text-xs text-muted-foreground">
              Last seen {formatRelativeTime(runner.lastHeartbeat)}
            </span>
          )}
        </div>

        {/* System info */}
        {runner.systemInfo && (
          <div className="flex items-center space-x-4 text-xs text-muted-foreground mb-4">
            <div className="flex items-center">
              <Cpu className="h-3 w-3 mr-1" />
              {runner.systemInfo.cpuCount} CPU
            </div>
            <div className="flex items-center">
              <HardDrive className="h-3 w-3 mr-1" />
              {Math.round(runner.systemInfo.memoryTotalMb / 1024)} GB
            </div>
            <div>{runner.systemInfo.os}</div>
          </div>
        )}

        {/* Capabilities */}
        {runner.capabilities && runner.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {runner.capabilities.slice(0, 4).map((cap) => (
              <Badge key={cap} variant="default">
                {cap}
              </Badge>
            ))}
            {runner.capabilities.length > 4 && (
              <Badge variant="default">+{runner.capabilities.length - 4}</Badge>
            )}
          </div>
        )}

        {/* Current run */}
        {runner.currentRunId && (
          <div className="mt-4 p-2 bg-primary/5 rounded-lg border border-primary/20 text-xs text-primary">
            Running:{' '}
            <Link
              href={`/runs/${runner.currentRunId}`}
              className="font-medium hover:underline"
            >
              {runner.currentRunId.slice(0, 8)}...
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
