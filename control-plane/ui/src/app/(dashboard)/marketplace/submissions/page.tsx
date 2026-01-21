'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  Package,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';

// Mock data for submissions pending review
const mockSubmissions = [
  {
    id: '3',
    name: 'Invoice Data Extractor',
    slug: 'invoice-data-extractor',
    description: 'Extract structured data from PDF invoices using AI. Supports multiple languages and invoice formats.',
    category: 'finance',
    tags: ['ocr', 'ai', 'invoices', 'pdf'],
    executionMode: 'cloud',
    publisher: {
      id: 'partner-2',
      type: 'partner',
      name: 'RPA Solutions Ltd',
      email: 'partners@rpasolutions.io',
      verified: false,
    },
    currentVersion: '1.0.0',
    pricing: { model: 'subscription', monthlyBase: 299 },
    submittedAt: '2025-01-18T14:30:00Z',
    requirements: {
      connections: ['openai', 'azure-blob'],
      minEngineVersion: '1.2.0',
    },
  },
  {
    id: '6',
    name: 'Customer Support Chatbot',
    slug: 'customer-support-chatbot',
    description: 'AI-powered customer support automation with multi-channel integration. Handles tickets, emails, and live chat.',
    category: 'sales',
    tags: ['ai', 'chatbot', 'support', 'multichannel'],
    executionMode: 'hybrid',
    publisher: {
      id: 'partner-4',
      type: 'partner',
      name: 'NewTech Automations',
      email: 'hello@newtech.dev',
      verified: false,
    },
    currentVersion: '1.0.0',
    pricing: { model: 'hybrid', monthlyBase: 199, minimumMonthly: 1000 },
    submittedAt: '2025-01-15T09:00:00Z',
    requirements: {
      connections: ['anthropic', 'slack', 'zendesk'],
      minEngineVersion: '1.3.0',
    },
  },
  {
    id: '7',
    name: 'Expense Report Processor',
    slug: 'expense-report-processor',
    description: 'Automatically process and categorize expense reports from receipts and credit card statements.',
    category: 'finance',
    tags: ['ocr', 'expenses', 'finance', 'receipts'],
    executionMode: 'cloud',
    publisher: {
      id: 'partner-3',
      type: 'partner',
      name: 'Bot Factory Co',
      email: 'biz@botfactory.co',
      verified: true,
    },
    currentVersion: '2.0.0',
    pricing: { model: 'usage', usageMetrics: [{ metric: 'reports_processed', pricePerUnit: 0.50 }] },
    submittedAt: '2025-01-12T11:45:00Z',
    requirements: {
      connections: ['aws-textract', 'quickbooks'],
      minEngineVersion: '1.2.5',
    },
  },
];

const executionModeConfig: Record<string, { icon: React.ElementType; label: string; bgColor: string; textColor: string }> = {
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

export default function SubmissionsPage() {
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean[]>>({});

  const handleApprove = (id: string) => {
    console.log('Approving bot:', id);
  };

  const handleReject = (id: string) => {
    console.log('Rejecting bot:', id);
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
      {/* Back Link */}
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Bot Submissions</h1>
          <p className="text-zinc-500 mt-1">Review and approve partner bot submissions</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium">
            <Clock className="h-4 w-4" />
            {mockSubmissions.length} pending review
          </span>
        </div>
      </div>

      {/* Submissions */}
      {mockSubmissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-900">All caught up!</p>
          <p className="text-sm text-zinc-500 mt-1">No pending submissions to review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {mockSubmissions.map((submission) => {
            const execMode = executionModeConfig[submission.executionMode];
            const ExecIcon = execMode.icon;
            const category = categoryConfig[submission.category] || categoryConfig.custom;
            const isExpanded = expandedSubmission === submission.id;
            const daysSince = getDaysSince(submission.submittedAt);
            const checklistProgress = getChecklistProgress(submission.id);

            return (
              <div key={submission.id} className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {submission.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-zinc-900">{submission.name}</h3>
                          <span className="text-sm text-zinc-400">v{submission.currentVersion}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${category.bgColor} ${category.textColor}`}>
                            {submission.category}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${execMode.bgColor} ${execMode.textColor}`}>
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
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  {/* Basic Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Building2 className="h-5 w-5 text-zinc-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide">Publisher</p>
                        <p className="font-medium text-zinc-900 text-sm">{submission.publisher.name}</p>
                        <p className="text-xs text-zinc-500">{submission.publisher.email}</p>
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
                          {new Date(submission.submittedAt).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {new Date(submission.submittedAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <DollarSign className="h-5 w-5 text-zinc-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide">Pricing</p>
                        <p className="font-medium text-zinc-900 text-sm">
                          {submission.pricing.model === 'subscription' && `$${submission.pricing.monthlyBase}/mo`}
                          {submission.pricing.model === 'usage' && 'Pay per use'}
                          {submission.pricing.model === 'hybrid' && `$${submission.pricing.monthlyBase}/mo + usage`}
                        </p>
                        {submission.pricing.minimumMonthly && (
                          <p className="text-xs text-zinc-500">
                            Min: ${submission.pricing.minimumMonthly}/mo
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-zinc-600 mb-4">{submission.description}</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {submission.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 pt-4 mt-4 space-y-4">
                      {/* Requirements */}
                      <div>
                        <h4 className="font-medium text-zinc-900 text-sm mb-3">Requirements</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-3 rounded-lg bg-zinc-50">
                            <p className="text-xs text-zinc-500 mb-2">Connections Required</p>
                            <div className="flex flex-wrap gap-1.5">
                              {submission.requirements.connections.map((conn) => (
                                <span key={conn} className="px-2 py-0.5 rounded border border-zinc-200 bg-white text-zinc-700 text-xs">
                                  {conn}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-50">
                            <p className="text-xs text-zinc-500 mb-2">Min Engine Version</p>
                            <p className="font-medium text-zinc-900">{submission.requirements.minEngineVersion}</p>
                          </div>
                        </div>
                      </div>

                      {/* Review Checklist */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-zinc-900 text-sm">Review Checklist</h4>
                          <span className="text-xs text-zinc-500">{checklistProgress}/5 completed</span>
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

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-zinc-100">
                    <button
                      onClick={() => handleReject(submission.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(submission.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4" />
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
