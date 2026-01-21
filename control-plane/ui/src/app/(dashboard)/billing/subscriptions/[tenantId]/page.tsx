'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Ban,
  RefreshCw,
  Building2,
  Calendar,
  Activity,
  ExternalLink,
} from 'lucide-react';

// Mock data
const mockSubscription = {
  id: '1',
  tenantId: 'tenant-1',
  tenantName: 'Acme Corp Production',
  stripeCustomerId: 'cus_abc123',
  stripeSubscriptionId: 'sub_xyz789',
  status: 'active',
  paymentMethodType: 'ach_debit',
  bankName: 'Chase',
  bankAccountLast4: '4242',
  bankAccountType: 'checking',
  monthlyAmount: 4500,
  currency: 'USD',
  currentPeriodStart: '2025-01-15',
  currentPeriodEnd: '2025-02-15',
  failedPaymentAttempts: 0,
  gracePeriodDays: 14,
  botsCanRun: true,
  createdAt: '2024-06-01',
};

const mockPayments = [
  { id: '1', amount: 4500, status: 'succeeded', invoicePeriod: '2025-01', createdAt: '2025-01-15T10:00:00Z' },
  { id: '2', amount: 4500, status: 'succeeded', invoicePeriod: '2024-12', createdAt: '2024-12-15T10:00:00Z' },
  { id: '3', amount: 4200, status: 'succeeded', invoicePeriod: '2024-11', createdAt: '2024-11-15T10:00:00Z' },
  { id: '4', amount: 4200, status: 'succeeded', invoicePeriod: '2024-10', createdAt: '2024-10-15T10:00:00Z' },
];

const mockUsage = {
  period: '2025-01',
  metrics: {
    claims_created: { quantity: 1250, amount: 3750 },
    calls_answered: { quantity: 450, amount: 900 },
    emails_processed: { quantity: 2800, amount: 280 },
  },
  totalAmount: 4930,
};

const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
  active: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Active' },
  trialing: { color: 'text-blue-700', bgColor: 'bg-blue-50', icon: Clock, label: 'Trial' },
  past_due: { color: 'text-amber-700', bgColor: 'bg-amber-50', icon: AlertTriangle, label: 'Past Due' },
  suspended: { color: 'text-red-700', bgColor: 'bg-red-50', icon: Ban, label: 'Suspended' },
  canceled: { color: 'text-zinc-600', bgColor: 'bg-zinc-100', icon: XCircle, label: 'Canceled' },
};

export default function SubscriptionDetailPage() {
  const params = useParams();
  const tenantId = params.tenantId as string;
  const [isReactivating, setIsReactivating] = useState(false);

  const subscription = mockSubscription;
  const status = statusConfig[subscription.status] || statusConfig.active;
  const StatusIcon = status.icon;

  const handleReactivate = async () => {
    setIsReactivating(true);
    setTimeout(() => setIsReactivating(false), 1000);
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      {/* Back Link */}
      <Link
        href="/billing"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-zinc-100 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-zinc-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{subscription.tenantName}</h1>
            <p className="text-zinc-500">{tenantId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${status.bgColor} ${status.color}`}>
            <StatusIcon className="h-4 w-4" />
            {status.label}
          </span>
          {subscription.status === 'suspended' && (
            <button
              onClick={handleReactivate}
              disabled={isReactivating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${isReactivating ? 'animate-spin' : ''}`} />
              Reactivate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Subscription Details */}
          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Subscription Details</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-zinc-500 mb-1">Monthly Amount</p>
                <p className="text-2xl font-semibold text-zinc-900">
                  ${subscription.monthlyAmount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Billing Cycle</p>
                <p className="text-sm font-medium text-zinc-900">
                  {new Date(subscription.currentPeriodStart).toLocaleDateString()} –{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Bot Execution</p>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                  subscription.botsCanRun ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                  {subscription.botsCanRun ? (
                    <><CheckCircle2 className="h-3 w-3" /> Enabled</>
                  ) : (
                    <><Ban className="h-3 w-3" /> Disabled</>
                  )}
                </span>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Grace Period</p>
                <p className="text-sm font-medium text-zinc-900">{subscription.gracePeriodDays} days</p>
              </div>
            </div>
          </section>

          {/* Payment Method */}
          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="font-medium text-zinc-900">Payment Method</h2>
              <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                Update
              </button>
            </div>
            <div className="p-5">
              {subscription.bankName ? (
                <div className="flex items-center gap-4 p-4 rounded-lg bg-zinc-50">
                  <div className="h-10 w-10 rounded-lg bg-white border border-zinc-200 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-zinc-500" />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">{subscription.bankName}</p>
                    <p className="text-sm text-zinc-500">
                      {subscription.bankAccountType?.charAt(0).toUpperCase()}
                      {subscription.bankAccountType?.slice(1)} ****{subscription.bankAccountLast4}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <CreditCard className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500 mb-3">No payment method configured</p>
                  <button className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
                    Add Payment Method
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Payment History */}
          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Payment History</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {mockPayments.map((payment) => (
                <div key={payment.id} className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-zinc-500" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900">Invoice {payment.invoicePeriod}</p>
                      <p className="text-sm text-zinc-500">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-zinc-900">${payment.amount.toLocaleString()}</p>
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                      Paid
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Current Usage */}
          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Activity className="h-4 w-4 text-zinc-400" />
              <h2 className="font-medium text-zinc-900">Current Usage</h2>
            </div>
            <div className="p-5 space-y-4">
              {Object.entries(mockUsage.metrics).map(([metric, data]) => (
                <div key={metric} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 capitalize">
                      {metric.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-zinc-500">{data.quantity.toLocaleString()} units</p>
                  </div>
                  <p className="text-sm font-medium text-zinc-900">
                    ${data.amount?.toLocaleString() || '0'}
                  </p>
                </div>
              ))}
              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <p className="font-medium text-zinc-900">Total Usage</p>
                <p className="text-lg font-semibold text-zinc-900">
                  ${mockUsage.totalAmount.toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          {/* Stripe Integration */}
          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Stripe</h2>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Customer ID</p>
                <code className="text-xs bg-zinc-100 px-2 py-1 rounded font-mono">
                  {subscription.stripeCustomerId}
                </code>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Subscription ID</p>
                <code className="text-xs bg-zinc-100 px-2 py-1 rounded font-mono">
                  {subscription.stripeSubscriptionId}
                </code>
              </div>
              <a
                href={`https://dashboard.stripe.com/customers/${subscription.stripeCustomerId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full mt-4 px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                View in Stripe
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </section>

          {/* Timeline */}
          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <h2 className="font-medium text-zinc-900">Timeline</h2>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Created</span>
                <span className="text-zinc-900">{new Date(subscription.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Next Billing</span>
                <span className="text-zinc-900">{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Failed Attempts</span>
                <span className="text-zinc-900">{subscription.failedPaymentAttempts}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
