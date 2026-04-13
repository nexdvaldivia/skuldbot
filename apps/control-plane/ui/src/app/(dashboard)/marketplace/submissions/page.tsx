'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import { marketplaceApi, type MarketplaceBot } from '@/lib/api';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Building2,
  Calendar,
  Cloud,
  Server,
  Zap,
  DollarSign,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
} from 'lucide-react';

const executionModeConfig: Record<
  string,
  { icon: React.ElementType; label: string; bgColor: string; textColor: string }
> = {
  cloud: { icon: Cloud, label: 'Cloud', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  runner: { icon: Server, label: 'Runner', bgColor: 'bg-violet-50', textColor: 'text-violet-700' },
  hybrid: { icon: Zap, label: 'Hybrid', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
};

const categoryConfig: Record<string, { bgColor: string; textColor: string }> = {
  insurance: { bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  finance: { bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  hr: { bgColor: 'bg-violet-50', textColor: 'text-violet-700' },
  sales: { bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  email: { bgColor: 'bg-rose-50', textColor: 'text-rose-700' },
  custom: { bgColor: 'bg-zinc-100', textColor: 'text-zinc-700' },
};

function getSubmissionDate(submission: MarketplaceBot): string {
  return submission.submittedAt || submission.createdAt;
}

function getPricingLabel(submission: MarketplaceBot): string {
  const pricingModel = submission.pricing?.model || submission.pricingModel;
  if (pricingModel === 'subscription') {
    return submission.pricing?.monthlyBase
      ? `$${submission.pricing.monthlyBase}/mo`
      : 'Subscription';
  }
  if (pricingModel === 'usage') {
    return 'Pay per use';
  }
  if (pricingModel === 'hybrid') {
    return submission.pricing?.monthlyBase
      ? `$${submission.pricing.monthlyBase}/mo + usage`
      : 'Hybrid pricing';
  }
  return 'Free';
}

export default function SubmissionsPage() {
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean[]>>({});
  const [submissions, setSubmissions] = useState<MarketplaceBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const data = await marketplaceApi.getSubmissions();
      setSubmissions(data);
    } catch (error) {
      setSubmissions([]);
      toast({
        variant: 'error',
        title: 'Failed to load submissions',
        description:
          error instanceof Error ? error.message : 'Could not fetch marketplace submissions.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubmissions();
  }, []);

  const handleApprove = async (id: string) => {
    const submission = submissions.find((item) => item.id === id);

    try {
      setPendingActionId(id);
      await marketplaceApi.approveBot(id);
      setSubmissions((current) => current.filter((item) => item.id !== id));
      toast({
        variant: 'success',
        title: 'Submission approved',
        description: `${submission?.name ?? 'Bot'} is now approved for marketplace publication.`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Approval failed',
        description: error instanceof Error ? error.message : 'Could not approve submission.',
      });
    } finally {
      setPendingActionId(null);
    }
  };

  const handleReject = async (id: string) => {
    const submission = submissions.find((item) => item.id === id);

    try {
      setPendingActionId(id);
      await marketplaceApi.rejectBot(id, 'Rejected from control plane review');
      setSubmissions((current) => current.filter((item) => item.id !== id));
      toast({
        variant: 'warning',
        title: 'Submission rejected',
        description: `${submission?.name ?? 'Bot'} was rejected and returned to the partner.`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Rejection failed',
        description: error instanceof Error ? error.message : 'Could not reject submission.',
      });
    } finally {
      setPendingActionId(null);
    }
  };

  const toggleCheckItem = (submissionId: string, index: number) => {
    setCheckedItems((prev) => {
      const current = prev[submissionId] || [false, false, false, false, false];
      const updated = [...current];
      updated[index] = !updated[index];
      return { ...prev, [submissionId]: updated };
    });
  };

  const getChecklistProgress = (submissionId: string) => {
    const items = checkedItems[submissionId] || [];
    return items.filter(Boolean).length;
  };

  const getDaysSince = (dateStr: string) => {
    const submitted = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Bot Submissions</h1>
          <p className="text-zinc-500 mt-1">Review and approve partner bot submissions</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium">
            <Clock className="h-4 w-4" />
            {submissions.length} pending review
          </span>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <Loader2 className="h-8 w-8 text-zinc-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-zinc-500">Loading submissions...</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-900">All caught up!</p>
          <p className="text-sm text-zinc-500 mt-1">No pending submissions to review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => {
            const execMode =
              executionModeConfig[submission.executionMode] || executionModeConfig.cloud;
            const ExecIcon = execMode.icon;
            const category = categoryConfig[submission.category] || categoryConfig.custom;
            const isExpanded = expandedSubmission === submission.id;
            const submittedAt = getSubmissionDate(submission);
            const daysSince = getDaysSince(submittedAt);
            const checklistProgress = getChecklistProgress(submission.id);

            return (
              <div
                key={submission.id}
                className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {submission.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-zinc-900">{submission.name}</h3>
                          <span className="text-sm text-zinc-400">
                            v{submission.currentVersion}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${category.bgColor} ${category.textColor}`}
                          >
                            {submission.category}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${execMode.bgColor} ${execMode.textColor}`}
                          >
                            <ExecIcon className="h-3 w-3" />
                            {execMode.label}
                          </span>
                          {daysSince > 3 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                              <AlertCircle className="h-3 w-3" />
                              {daysSince} days waiting
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedSubmission(isExpanded ? null : submission.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      {isExpanded ? 'Collapse' : 'Review'}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Building2 className="h-5 w-5 text-zinc-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide">Publisher</p>
                        <p className="font-medium text-zinc-900 text-sm">
                          {submission.publisher.name}
                        </p>
                        {submission.publisher.email && (
                          <p className="text-xs text-zinc-500">{submission.publisher.email}</p>
                        )}
                        {submission.publisher.verified && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 mt-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-zinc-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide">Submitted</p>
                        <p className="font-medium text-zinc-900 text-sm">
                          {new Date(submittedAt).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {new Date(submittedAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <DollarSign className="h-5 w-5 text-zinc-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide">Pricing</p>
                        <p className="font-medium text-zinc-900 text-sm">
                          {getPricingLabel(submission)}
                        </p>
                        {submission.pricing?.minimumMonthly && (
                          <p className="text-xs text-zinc-500">
                            Min: ${submission.pricing.minimumMonthly}/mo
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-zinc-600 mb-4">{submission.description}</p>

                  {submission.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {submission.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="border-t border-zinc-100 pt-4 mt-4 space-y-4">
                      <div>
                        <h4 className="font-medium text-zinc-900 text-sm mb-3">Requirements</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-3 rounded-lg bg-zinc-50">
                            <p className="text-xs text-zinc-500 mb-2">Connections Required</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(submission.requirements?.connections || []).map((conn) => (
                                <span
                                  key={conn}
                                  className="px-2 py-0.5 rounded border border-zinc-200 bg-white text-zinc-700 text-xs"
                                >
                                  {conn}
                                </span>
                              ))}
                              {(submission.requirements?.connections || []).length === 0 && (
                                <span className="text-xs text-zinc-500">
                                  No declared connections
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-50">
                            <p className="text-xs text-zinc-500 mb-2">Min Engine Version</p>
                            <p className="font-medium text-zinc-900">
                              {submission.requirements?.minEngineVersion || 'Not specified'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-zinc-900 text-sm">Review Checklist</h4>
                          <span className="text-xs text-zinc-500">
                            {checklistProgress}/5 completed
                          </span>
                        </div>
                        <div className="space-y-2">
                          {[
                            'Bot package validated and tested',
                            'Description and documentation reviewed',
                            'Pricing model appropriate',
                            'No security concerns identified',
                            'Partner verified and in good standing',
                          ].map((item, index) => (
                            <label
                              key={item}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checkedItems[submission.id]?.[index] || false}
                                onChange={() => toggleCheckItem(submission.id, index)}
                                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-zinc-700">{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-zinc-100">
                    <button
                      onClick={() => handleReject(submission.id)}
                      disabled={pendingActionId === submission.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-60"
                    >
                      {pendingActionId === submission.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(submission.id)}
                      disabled={pendingActionId === submission.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                    >
                      {pendingActionId === submission.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
