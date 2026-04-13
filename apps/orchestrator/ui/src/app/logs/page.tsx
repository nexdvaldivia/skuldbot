'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuditLogs } from '@/hooks/use-api';
import {
  FileText,
  Search,
  Filter,
  Download,
  RefreshCw,
  User,
  Bot,
  Server,
  Settings,
  Shield,
  AlertTriangle,
  Info,
} from 'lucide-react';

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  auth: Shield,
  user: User,
  bot: Bot,
  runner: Server,
  setting: Settings,
  system: Info,
};

const actionColors: Record<string, string> = {
  create: 'bg-brand-100 text-brand-700',
  update: 'bg-info-100 text-info-700',
  delete: 'bg-error-100 text-error-700',
  login: 'bg-info-100 text-info-700',
  logout: 'bg-zinc-100 text-zinc-700',
  execute: 'bg-warning-100 text-warning-700',
};

export default function LogsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  const { data, isLoading, isFetching, isError, error, refetch } = useAuditLogs({
    limit: 200,
  });

  const logs = data?.logs || [];

  const filteredLogs = useMemo(
    () =>
      logs.filter(
        (log) =>
          log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (log.userEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.category.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [logs, searchQuery],
  );

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      toast({
        title: 'Refresh failed',
        description:
          result.error instanceof Error ? result.error.message : 'Unable to refresh audit logs.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Logs updated',
      description: 'Audit events were refreshed successfully.',
    });
  };

  const handleFiltersClick = () => {
    if (!searchQuery.trim()) {
      toast({
        title: 'Filters',
        description: 'Use the search bar to filter by action, user email, or category.',
      });
      return;
    }

    toast({
      title: 'Filter active',
      description: `Showing logs matching "${searchQuery.trim()}".`,
    });
  };

  const handleExport = () => {
    const query = new URLSearchParams();
    if (searchQuery.trim()) {
      query.set('search', searchQuery.trim());
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    window.open(`/api/audit/export/csv${suffix}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">
            Track all actions and changes in your organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleFiltersClick}>
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Logs List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center gap-2">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="font-medium">Unable to load audit logs</p>
              <p className="text-sm text-muted-foreground max-w-md">
                {error instanceof Error ? error.message : 'An unexpected error occurred.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No audit logs yet</h3>
              <p className="text-muted-foreground max-w-sm">
                Audit logs will appear here as actions are performed in your organization. All user
                activities, bot executions, and configuration changes are tracked.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>{filteredLogs.length} log entries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredLogs.map((log) => {
                const CategoryIcon = categoryIcons[log.category] || Info;
                const actionColor =
                  actionColors[log.action.split('_')[0]] || 'bg-zinc-100 text-zinc-700';

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <CategoryIcon className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={actionColor}>
                          {log.action}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{log.category}</span>
                      </div>
                      <p className="text-sm">
                        <span className="font-medium">{log.userEmail || 'System'}</span>
                        {' performed '}
                        <span className="font-medium">{log.action}</span>
                        {' on '}
                        <span className="font-medium">{log.resourceType || 'resource'}</span>
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{formatTimestamp(log.timestamp)}</span>
                        {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
