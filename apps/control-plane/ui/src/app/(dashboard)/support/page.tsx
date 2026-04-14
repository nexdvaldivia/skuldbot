'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Headphones,
  Inbox,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserX,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

type TicketStats = {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  slaBreached: number;
  unassigned: number;
};

type TicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  clientName: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  assignedTo: string | null;
  slaBreached: boolean;
  createdAt: string;
};

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-zinc-400',
};

export default function SupportDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TicketStats>({
    open: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
    slaBreached: 0,
    unassigned: 0,
  });
  const [atRiskTickets, setAtRiskTickets] = useState<TicketSummary[]>([]);
  const [recentTickets, setRecentTickets] = useState<TicketSummary[]>([]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      // TODO: Replace with supportApi.getStats(), supportApi.getAtRisk(), supportApi.listRecent()
      setStats({ open: 0, pending: 0, resolved: 0, closed: 0, slaBreached: 0, unassigned: 0 });
      setAtRiskTickets([]);
      setRecentTickets([]);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to load support dashboard',
        description: error instanceof Error ? error.message : 'Unexpected error.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return <LoadingSpinner label="Loading support dashboard..." />;
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      <PageHeader
        icon={Headphones}
        title="Support"
        description="Ticket management, SLA tracking, and customer satisfaction"
        action={
          <div className="flex gap-2">
            <Link href="/support/tickets">
              <button className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                <Inbox className="w-4 h-4" />
                All Tickets
              </button>
            </Link>
            <Link href="/support/settings">
              <button className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                Settings
              </button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mt-6 mb-8">
        <StatCard label="Open" value={stats.open} icon={Inbox} />
        <StatCard label="Pending" value={stats.pending} icon={Clock} />
        <StatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} />
        <StatCard
          label="SLA Breached"
          value={stats.slaBreached}
          icon={AlertTriangle}
          className={stats.slaBreached > 0 ? 'border-red-200 bg-red-50/30' : undefined}
        />
        <StatCard
          label="Unassigned"
          value={stats.unassigned}
          icon={UserX}
          className={stats.unassigned > 0 ? 'border-amber-200 bg-amber-50/30' : undefined}
        />
        <StatCard label="Closed" value={stats.closed} icon={BarChart3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* At-Risk Tickets */}
        <section className="bg-white rounded-xl border border-zinc-200">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-zinc-900">At Risk (SLA)</h2>
            </div>
            {atRiskTickets.length > 0 && (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                {atRiskTickets.length}
              </span>
            )}
          </div>
          {atRiskTickets.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">All tickets within SLA</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {atRiskTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/support/tickets/${ticket.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 transition-colors group"
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[ticket.priority]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{ticket.subject}</p>
                    <p className="text-xs text-zinc-500">
                      {ticket.ticketNumber} - {ticket.clientName}
                    </p>
                  </div>
                  {ticket.slaBreached && <Badge variant="destructive">Breached</Badge>}
                  <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recent Tickets */}
        <section className="bg-white rounded-xl border border-zinc-200">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Recent Tickets</h2>
            <Link
              href="/support/tickets"
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              View All
            </Link>
          </div>
          {recentTickets.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No tickets yet"
              description="Tickets from clients will appear here."
              className="py-10"
            />
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/support/tickets/${ticket.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 transition-colors group"
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[ticket.priority]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{ticket.subject}</p>
                    <p className="text-xs text-zinc-500">
                      {ticket.ticketNumber} - {ticket.clientName}
                    </p>
                  </div>
                  <Badge variant="secondary">{ticket.status}</Badge>
                  <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
