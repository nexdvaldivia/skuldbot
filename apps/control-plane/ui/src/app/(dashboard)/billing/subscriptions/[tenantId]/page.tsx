'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import {
  billingApi,
  mcpApi,
  type PaymentHistory,
  type TenantSubscription,
  type UsageSummary,
  type MCPTenantUsageSummary,
  type MCPActiveRunnersSummary,
  type MCPMarketplaceSubscription,
} from '@/lib/api';
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
  Loader2,
} from 'lucide-react';

const statusConfig: Record<
  string,
  { color: string; bgColor: string; icon: React.ElementType; label: string }
> = {
  active: {
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    icon: CheckCircle2,
    label: 'Active',
  },
  trialing: { color: 'text-blue-700', bgColor: 'bg-blue-50', icon: Clock, label: 'Trial' },
  past_due: {
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    icon: AlertTriangle,
    label: 'Past Due',
  },
  suspended: { color: 'text-red-700', bgColor: 'bg-red-50', icon: Ban, label: 'Suspended' },
  canceled: { color: 'text-zinc-600', bgColor: 'bg-zinc-100', icon: XCircle, label: 'Canceled' },
  unpaid: { color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle, label: 'Unpaid' },
};

const paymentStatusClass: Record<string, string> = {
  succeeded: 'bg-emerald-50 text-emerald-700',
  processing: 'bg-amber-50 text-amber-700',
  pending: 'bg-blue-50 text-blue-700',
  failed: 'bg-red-50 text-red-700',
  refunded: 'bg-zinc-100 text-zinc-700',
  disputed: 'bg-red-50 text-red-700',
};

function isMissingSubscriptionResponse(
  response: TenantSubscription | { exists: false },
): response is { exists: false } {
  return 'exists' in response && response.exists === false;
}

export default function SubscriptionDetailPage() {
  const params = useParams();
  const tenantId = params.tenantId as string;

  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [meteringSummary, setMeteringSummary] = useState<MCPTenantUsageSummary | null>(null);
  const [activeRunners, setActiveRunners] = useState<MCPActiveRunnersSummary | null>(null);
  const [marketplaceSubscriptions, setMarketplaceSubscriptions] = useState<
    MCPMarketplaceSubscription[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isReactivating, setIsReactivating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const subscriptionResponse = await billingApi.getSubscription(tenantId);

      if (isMissingSubscriptionResponse(subscriptionResponse)) {
        setSubscription(null);
        setPayments([]);
        setUsage(null);
        setMeteringSummary(null);
        setActiveRunners(null);
        setMarketplaceSubscriptions([]);
        return;
      }

      setSubscription(subscriptionResponse);

      const [
        paymentsData,
        usageData,
        meteringData,
        activeRunnersData,
        marketplaceSubscriptionsData,
      ] = await Promise.all([
        billingApi.getPaymentHistory(tenantId, 20),
        billingApi.getTenantUsage(tenantId),
        mcpApi.getTenantUsageSummary(tenantId),
        mcpApi.getActiveRunners(tenantId),
        mcpApi.listSubscribedBots(tenantId),
      ]);

      setPayments(paymentsData);
      setUsage(usageData);
      setMeteringSummary(meteringData);
      setActiveRunners(activeRunnersData);
      setMarketplaceSubscriptions(marketplaceSubscriptionsData);
    } catch (error) {
      setSubscription(null);
      setPayments([]);
      setUsage(null);
      setMeteringSummary(null);
      setActiveRunners(null);
      setMarketplaceSubscriptions([]);
      toast({
        variant: 'error',
        title: 'Failed to load subscription',
        description:
          error instanceof Error ? error.message : 'Could not fetch subscription details.',
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      return;
    }

    void loadData();
  }, [loadData, tenantId]);

  const handleReactivate = async () => {
    if (!subscription) {
      return;
    }

    try {
      setIsReactivating(true);
      const updated = await billingApi.reactivateSubscription(tenantId, 'control-plane-ui');
      setSubscription(updated);
      toast({
        variant: 'success',
        title: 'Subscription reactivated',
        description: `${updated.tenantName} can run bots again.`,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Reactivation failed',
        description: error instanceof Error ? error.message : 'Could not reactivate subscription.',
      });
    } finally {
      setIsReactivating(false);
    }
  };

  const handleUpdatePaymentMethod = () => {
    toast({
      variant: 'warning',
      title: 'Action not available',
      description: 'Payment method update flow is not enabled in this portal yet.',
    });
  };

  const handleAddPaymentMethod = () => {
    toast({
      variant: 'warning',
      title: 'Action not available',
      description: 'Payment method setup flow is not enabled in this portal yet.',
    });
  };

  if (loading) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <Loader2 className="h-8 w-8 text-zinc-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-zinc-500">Loading subscription...</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
        <Link
          href="/billing"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Billing
        </Link>

        <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-900">No subscription found</p>
          <p className="text-sm text-zinc-500 mt-1">
            Tenant {tenantId} has no active subscription record.
          </p>
        </div>
      </div>
    );
  }

  const status = statusConfig[subscription.status] || statusConfig.active;
  const StatusIcon = status.icon;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <Link
        href="/billing"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </Link>

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
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${status.bgColor} ${status.color}`}
          >
            <StatusIcon className="h-4 w-4" />
            {status.label}
          </span>
          {subscription.status === 'suspended' && (
            <button
              onClick={handleReactivate}
              disabled={isReactivating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isReactivating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Reactivate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Subscription Details</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-zinc-500 mb-1">Monthly Amount</p>
                <p className="text-2xl font-semibold text-zinc-900">
                  ${Number(subscription.monthlyAmount || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Billing Cycle</p>
                <p className="text-sm font-medium text-zinc-900">
                  {subscription.currentPeriodStart
                    ? new Date(subscription.currentPeriodStart).toLocaleDateString()
                    : 'N/A'}{' '}
                  –{' '}
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Bot Execution</p>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                    subscription.botsCanRun
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {subscription.botsCanRun ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Enabled
                    </>
                  ) : (
                    <>
                      <Ban className="h-3 w-3" /> Disabled
                    </>
                  )}
                </span>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Grace Period</p>
                <p className="text-sm font-medium text-zinc-900">
                  {subscription.gracePeriodDays} days
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="font-medium text-zinc-900">Payment Method</h2>
              <button
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                onClick={handleUpdatePaymentMethod}
              >
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
                  <button
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    onClick={handleAddPaymentMethod}
                  >
                    Add Payment Method
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Payment History</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {payments.map((payment) => (
                <div key={payment.id} className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-zinc-500" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900">
                        Invoice {payment.invoicePeriod || 'N/A'}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-zinc-900">${payment.amount.toLocaleString()}</p>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${paymentStatusClass[payment.status] || 'bg-zinc-100 text-zinc-700'}`}
                    >
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))}
              {payments.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  No payment history available.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Activity className="h-4 w-4 text-zinc-400" />
              <h2 className="font-medium text-zinc-900">Current Usage</h2>
            </div>
            <div className="p-5 space-y-4">
              {meteringSummary && (
                <>
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 p-3 text-center">
                    <div>
                      <p className="text-xs text-zinc-500">Bots</p>
                      <p className="text-sm font-semibold text-zinc-900">
                        {meteringSummary.summary.totalBots}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Claims</p>
                      <p className="text-sm font-semibold text-zinc-900">
                        {Math.round(meteringSummary.summary.totalClaimsCompleted).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">API Calls</p>
                      <p className="text-sm font-semibold text-zinc-900">
                        {Math.round(meteringSummary.summary.totalApiCalls).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {meteringSummary.botUsage.slice(0, 5).map((botUsage) => (
                    <div key={botUsage.botId} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          Bot {botUsage.botId.slice(0, 8)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {Object.values(botUsage.usage.metrics)
                            .reduce((sum, quantity) => sum + Number(quantity || 0), 0)
                            .toLocaleString()}{' '}
                          units
                        </p>
                      </div>
                      <p className="text-sm font-medium text-zinc-900">
                        ${Number(botUsage.willBeBilled || 0).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </>
              )}

              {Object.entries(usage?.metrics || {}).map(([metric, data]) => (
                <div key={metric} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 capitalize">
                      {metric.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-zinc-500">{data.quantity.toLocaleString()} units</p>
                  </div>
                  <p className="text-sm font-medium text-zinc-900">
                    ${Number(data.amount || 0).toLocaleString()}
                  </p>
                </div>
              ))}
              {usage && (
                <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                  <p className="font-medium text-zinc-900">Total Usage</p>
                  <p className="text-lg font-semibold text-zinc-900">
                    ${Number(usage.totalAmount || 0).toLocaleString()}
                  </p>
                </div>
              )}
              {!usage && !meteringSummary && (
                <p className="text-sm text-zinc-500">No usage data available yet.</p>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Marketplace Bot Subscriptions</h2>
            </div>
            <div className="p-5 space-y-3">
              {marketplaceSubscriptions.map((item) => (
                <div key={item.subscriptionId} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {item.botName || item.botId}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.pricingPlan} • downloads {item.downloadCount}
                    </p>
                  </div>
                  <span className="inline-flex rounded px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700">
                    {item.status}
                  </span>
                </div>
              ))}
              {marketplaceSubscriptions.length === 0 && (
                <p className="text-sm text-zinc-500">No active marketplace subscriptions.</p>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-900">Stripe</h2>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Customer ID</p>
                <code className="text-xs bg-zinc-100 px-2 py-1 rounded font-mono break-all">
                  {subscription.stripeCustomerId || 'Not set'}
                </code>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Subscription ID</p>
                <code className="text-xs bg-zinc-100 px-2 py-1 rounded font-mono break-all">
                  {subscription.stripeSubscriptionId || 'Not set'}
                </code>
              </div>
              {subscription.stripeCustomerId && (
                <a
                  href={`https://dashboard.stripe.com/customers/${subscription.stripeCustomerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full mt-4 px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  View in Stripe
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <h2 className="font-medium text-zinc-900">Timeline</h2>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Created</span>
                <span className="text-zinc-900">
                  {new Date(subscription.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Next Billing</span>
                <span className="text-zinc-900">
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Failed Attempts</span>
                <span className="text-zinc-900">{subscription.failedPaymentAttempts}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Active Runners</span>
                <span className="text-zinc-900">{activeRunners?.totalActive ?? 0}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
