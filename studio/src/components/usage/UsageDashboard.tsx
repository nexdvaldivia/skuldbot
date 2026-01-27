import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import {
  Activity,
  TrendingUp,
  DollarSign,
  Calendar,
  AlertCircle,
  Loader2,
  Download,
} from 'lucide-react';

interface UsageData {
  period: string;
  botUsage: BotUsage[];
  totalCost: number;
  projectedMonthlyCost: number;
}

interface BotUsage {
  botId: string;
  botName: string;
  metrics: {
    claimsCompleted?: number;
    apiCalls?: number;
    recordsProcessed?: number;
    executionCount?: number;
  };
  costs: {
    usageBased: number;
    callBased: number;
    monthlyMinimum: number;
    charged: number;
  };
  pricingModel: string;
}

export const UsageDashboard: React.FC = () => {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('current');

  useEffect(() => {
    loadUsageData();
  }, [selectedPeriod]);

  const loadUsageData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await invoke<UsageData>('mcp_get_usage_summary', {
        period: selectedPeriod,
      });

      setUsage(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load usage data');
      console.error('Usage data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    try {
      await invoke('export_usage_report', {
        period: usage?.period,
      });
      alert('Usage report exported successfully');
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#35D399]" />
            Usage & Billing
          </h2>

          <div className="flex items-center gap-3">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#35D399]"
            >
              <option value="current">Current Month</option>
              <option value="last">Last Month</option>
              <option value="last-3">Last 3 Months</option>
            </select>

            <button
              onClick={exportReport}
              disabled={!usage || loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#35D399] hover:bg-[#2ab380] text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-[#35D399] animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && usage && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Current Period Cost */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 dark:text-gray-400 text-sm">
                    Current Period Cost
                  </span>
                  <DollarSign className="w-5 h-5 text-[#35D399]" />
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  ${usage.totalCost.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {usage.period}
                </p>
              </div>

              {/* Projected Monthly */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 dark:text-gray-400 text-sm">
                    Projected Monthly
                  </span>
                  <TrendingUp className="w-5 h-5 text-[#35D399]" />
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  ${usage.projectedMonthlyCost.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Based on current usage
                </p>
              </div>

              {/* Active Bots */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 dark:text-gray-400 text-sm">
                    Active Bots
                  </span>
                  <Activity className="w-5 h-5 text-[#35D399]" />
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {usage.botUsage.length}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  In current period
                </p>
              </div>
            </div>

            {/* Bot Usage Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Bot Usage Breakdown
                </h3>
              </div>

              <div className="p-4 space-y-4">
                {usage.botUsage.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No bot usage recorded for this period
                  </p>
                ) : (
                  usage.botUsage.map((bot) => (
                    <div
                      key={bot.botId}
                      className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4"
                    >
                      {/* Bot Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {bot.botName}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {bot.pricingModel} pricing
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-[#35D399]">
                            ${bot.costs.charged.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Charged
                          </p>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        {bot.metrics.claimsCompleted !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Claims Completed
                            </p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                              {bot.metrics.claimsCompleted}
                            </p>
                          </div>
                        )}
                        {bot.metrics.apiCalls !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              API Calls
                            </p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                              {bot.metrics.apiCalls}
                            </p>
                          </div>
                        )}
                        {bot.metrics.recordsProcessed !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Records Processed
                            </p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                              {bot.metrics.recordsProcessed}
                            </p>
                          </div>
                        )}
                        {bot.metrics.executionCount !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Executions
                            </p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                              {bot.metrics.executionCount}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Cost Breakdown */}
                      {bot.pricingModel === 'hybrid' && (
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">
                                Usage-based
                              </p>
                              <p className="font-semibold text-gray-900 dark:text-white">
                                ${bot.costs.usageBased.toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">
                                Call-based
                              </p>
                              <p className="font-semibold text-gray-900 dark:text-white">
                                ${bot.costs.callBased.toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">
                                Monthly Min
                              </p>
                              <p className="font-semibold text-gray-900 dark:text-white">
                                ${bot.costs.monthlyMinimum.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Charged: Maximum of usage-based, call-based, or
                            monthly minimum
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

