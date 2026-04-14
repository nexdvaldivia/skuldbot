'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox, Plus, AlertTriangle, ChevronRight, Filter, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

type TicketPriority = 'critical' | 'high' | 'medium' | 'low';
type TicketStatusType = 'open' | 'pending' | 'resolved' | 'closed';

type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  clientName: string;
  priority: TicketPriority;
  status: TicketStatusType;
  category: string;
  assignedTo: string | null;
  slaBreached: boolean;
  createdAt: string;
  updatedAt: string;
};

const priorityConfig: Record<TicketPriority, { label: string; color: string; dot: string }> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700 bg-red-50 border-red-200',
    dot: 'bg-red-500',
  },
  high: {
    label: 'High',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    dot: 'bg-amber-500',
  },
  medium: {
    label: 'Medium',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    dot: 'bg-blue-500',
  },
  low: { label: 'Low', color: 'text-zinc-600 bg-zinc-50 border-zinc-200', dot: 'bg-zinc-400' },
};

const statusConfig: Record<
  TicketStatusType,
  { label: string; variant: 'default' | 'secondary' | 'warning' | 'success' }
> = {
  open: { label: 'Open', variant: 'default' },
  pending: { label: 'Pending', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'secondary' },
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TicketsPage() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      // TODO: Replace with supportApi.listTickets() when backend is ready
      setTickets([]);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to load tickets',
        description: error instanceof Error ? error.message : 'Unexpected error.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const filtered = tickets.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !t.subject.toLowerCase().includes(q) &&
        !t.ticketNumber.toLowerCase().includes(q) &&
        !t.clientName.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    return true;
  });

  if (loading) {
    return <LoadingSpinner label="Loading tickets..." />;
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      <PageHeader
        icon={Inbox}
        title="Support Tickets"
        description="Manage customer support requests and track SLA compliance"
        action={
          <div className="flex gap-2">
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Ticket
            </Button>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mt-6 mb-6">
        <SearchInput
          placeholder="Search by subject, ticket number, or client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="flex-1"
        />
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="w-3.5 h-3.5 mr-2 text-zinc-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No tickets found"
          description={
            tickets.length === 0
              ? 'No support tickets yet. Tickets from clients will appear here.'
              : 'No tickets match your filters. Try adjusting your search criteria.'
          }
          action={
            tickets.length === 0 ? (
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Ticket
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="divide-y divide-zinc-100">
            {filtered.map((ticket) => {
              const priority = priorityConfig[ticket.priority];
              const status = statusConfig[ticket.status];
              return (
                <Link
                  key={ticket.id}
                  href={`/support/tickets/${ticket.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/50 transition-colors group"
                >
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${priority.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-zinc-900 truncate">
                        {ticket.subject}
                      </span>
                      {ticket.slaBreached && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>{ticket.ticketNumber}</span>
                      <span className="text-zinc-300">|</span>
                      <span>{ticket.clientName}</span>
                      <span className="text-zinc-300">|</span>
                      <span>{ticket.category}</span>
                      {ticket.assignedTo ? (
                        <>
                          <span className="text-zinc-300">|</span>
                          <span>{ticket.assignedTo}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-zinc-300">|</span>
                          <span className="text-amber-600 font-medium">Unassigned</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priority.color}`}
                    >
                      {priority.label}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <span className="text-xs text-zinc-400 w-16 text-right">
                      {formatTimeAgo(ticket.updatedAt)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
