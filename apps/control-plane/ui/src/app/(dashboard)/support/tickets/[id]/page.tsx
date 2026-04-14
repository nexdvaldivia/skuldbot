'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Send,
  UserPlus,
  Tag,
  Merge,
  AlertTriangle,
  Paperclip,
  Lock,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/hooks/use-toast';

type Comment = {
  id: string;
  authorName: string;
  authorType: 'staff' | 'customer';
  content: string;
  isInternal: boolean;
  createdAt: string;
  attachments: { name: string; size: number }[];
};

type Activity = {
  id: string;
  action: string;
  details: string;
  performedBy: string;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  clientName: string;
  clientId: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  category: string;
  assignedTo: string | null;
  tags: string[];
  slaBreached: boolean;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  csatScore: number | null;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  activities: Activity[];
};

const priorityColors: Record<string, string> = {
  critical: 'text-red-700 bg-red-50 border-red-200',
  high: 'text-amber-700 bg-amber-50 border-amber-200',
  medium: 'text-blue-700 bg-blue-50 border-blue-200',
  low: 'text-zinc-600 bg-zinc-50 border-zinc-200',
};

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');

  const loadTicket = useCallback(async () => {
    try {
      setLoading(true);
      // TODO: Replace with supportApi.getTicket(ticketId)
      setTicket(null);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to load ticket',
        description: error instanceof Error ? error.message : 'Unexpected error.',
      });
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  if (loading) {
    return <LoadingSpinner label="Loading ticket..." />;
  }

  if (!ticket) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
        <EmptyState
          icon={AlertTriangle}
          title="Ticket not found"
          description="This ticket may have been deleted or you don't have access."
          action={
            <Link href="/support/tickets">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tickets
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/support/tickets"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Tickets
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-semibold text-zinc-900">{ticket.subject}</h1>
              {ticket.slaBreached && (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  SLA Breached
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-500">
              <span>{ticket.ticketNumber}</span>
              <span className="text-zinc-300">|</span>
              <span>{ticket.clientName}</span>
              <span className="text-zinc-300">|</span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityColors[ticket.priority]}`}
              >
                {ticket.priority}
              </span>
              <span className="text-zinc-300">|</span>
              <Badge variant="secondary">{ticket.status}</Badge>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm">
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Assign
            </Button>
            <Button variant="outline" size="sm">
              <Tag className="w-3.5 h-3.5 mr-1.5" />
              Tags
            </Button>
            <Button variant="outline" size="sm">
              <Merge className="w-3.5 h-3.5 mr-1.5" />
              Merge
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - Comments/Activity */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-zinc-200">
            <button
              onClick={() => setActiveTab('comments')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'comments'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Comments ({ticket.comments.length})
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'activity'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Activity ({ticket.activities.length})
            </button>
          </div>

          {/* Comment thread */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              {ticket.comments.length === 0 ? (
                <div className="text-center py-8 text-sm text-zinc-500">No comments yet.</div>
              ) : (
                ticket.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`rounded-xl border p-4 ${
                      comment.isInternal
                        ? 'bg-amber-50/50 border-amber-200'
                        : comment.authorType === 'staff'
                          ? 'bg-white border-zinc-200'
                          : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-zinc-900">
                        {comment.authorName}
                      </span>
                      {comment.isInternal && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          <Lock className="w-2.5 h-2.5" />
                          Internal
                        </span>
                      )}
                      <span className="text-xs text-zinc-400">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-700 whitespace-pre-wrap">{comment.content}</p>
                    {comment.attachments.length > 0 && (
                      <div className="flex gap-2 mt-3">
                        {comment.attachments.map((att) => (
                          <span
                            key={att.name}
                            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-100 rounded-lg px-2.5 py-1"
                          >
                            <Paperclip className="w-3 h-3" />
                            {att.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* New comment form */}
              <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a reply..."
                  rows={3}
                  className="w-full px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 border-0 focus:outline-none resize-none"
                />
                <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 border-t border-zinc-100">
                  <div className="flex items-center gap-3">
                    <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                      <Lock className="w-3 h-3" />
                      Internal note
                    </label>
                  </div>
                  <Button size="sm" disabled={!newComment.trim()}>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {isInternal ? 'Add Note' : 'Reply'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Activity log */}
          {activeTab === 'activity' && (
            <div className="space-y-3">
              {ticket.activities.length === 0 ? (
                <div className="text-center py-8 text-sm text-zinc-500">No activity recorded.</div>
              ) : (
                ticket.activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 mt-2 flex-shrink-0" />
                    <div>
                      <span className="text-zinc-700">{activity.details}</span>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {activity.performedBy} - {new Date(activity.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Sidebar - Ticket details */}
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Details
            </h3>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-zinc-500">Category</span>
                <p className="text-sm font-medium text-zinc-900">{ticket.category}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Assigned To</span>
                <p className="text-sm font-medium text-zinc-900">
                  {ticket.assignedTo || <span className="text-amber-600">Unassigned</span>}
                </p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Created</span>
                <p className="text-sm text-zinc-700">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Last Updated</span>
                <p className="text-sm text-zinc-700">
                  {new Date(ticket.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* SLA */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">SLA</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">First Response</span>
                <span
                  className={`text-xs font-medium ${ticket.slaBreached ? 'text-red-600' : 'text-emerald-600'}`}
                >
                  {ticket.firstResponseDueAt
                    ? new Date(ticket.firstResponseDueAt).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Resolution</span>
                <span
                  className={`text-xs font-medium ${ticket.slaBreached ? 'text-red-600' : 'text-zinc-700'}`}
                >
                  {ticket.resolutionDueAt
                    ? new Date(ticket.resolutionDueAt).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* CSAT */}
          {ticket.csatScore !== null && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Customer Satisfaction
              </h3>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-5 h-5 ${s <= (ticket.csatScore ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-zinc-200'}`}
                  />
                ))}
                <span className="text-sm font-medium text-zinc-700 ml-2">{ticket.csatScore}/5</span>
              </div>
            </div>
          )}

          {/* Tags */}
          {ticket.tags.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
