import * as React from 'react';
import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-zinc-200 bg-white p-5', className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-medium text-zinc-500">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-zinc-400" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-zinc-900 tracking-tight">{value}</span>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium',
              trend.positive ? 'text-emerald-600' : 'text-red-600',
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
