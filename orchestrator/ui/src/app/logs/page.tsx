'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  CheckCircle,
} from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  category: string;
  userId: string;
  userEmail: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  auth: Shield,
  user: User,
  bot: Bot,
  runner: Server,
  setting: Settings,
  system: Info,
};

const actionColors: Record<string, string> = {
  create: 'bg-green-500/10 text-green-600',
  update: 'bg-blue-500/10 text-blue-600',
  delete: 'bg-red-500/10 text-red-600',
  login: 'bg-purple-500/10 text-purple-600',
  logout: 'bg-gray-500/10 text-gray-600',
  execute: 'bg-orange-500/10 text-orange-600',
};

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // TODO: Fetch audit logs from API
    // For now, show empty state
    setLoading(false);
  }, []);

  const filteredLogs = logs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.category.toLowerCase().includes(searchQuery.toLowerCase())
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">Track all actions and changes in your organization</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
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
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Logs List */}
      {loading ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
                Audit logs will appear here as actions are performed in your organization.
                All user activities, bot executions, and configuration changes are tracked.
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
                const actionColor = actionColors[log.action.split('_')[0]] || 'bg-gray-500/10 text-gray-600';

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
                        <span className="text-sm text-muted-foreground">
                          {log.category}
                        </span>
                      </div>
                      <p className="text-sm">
                        <span className="font-medium">{log.userEmail}</span>
                        {' performed '}
                        <span className="font-medium">{log.action}</span>
                        {' on '}
                        <span className="font-medium">{log.resourceType}</span>
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{formatTimestamp(log.timestamp)}</span>
                        <span>IP: {log.ipAddress}</span>
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
