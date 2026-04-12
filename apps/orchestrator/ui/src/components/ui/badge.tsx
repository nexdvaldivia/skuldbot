import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-brand-100 text-brand-800',
        secondary: 'border-transparent bg-zinc-100 text-zinc-800',
        destructive: 'border-transparent bg-error-100 text-error-700',
        outline: 'border-zinc-200 text-zinc-700',
        success: 'border-transparent bg-brand-100 text-brand-700',
        warning: 'border-transparent bg-warning-100 text-warning-700',
        error: 'border-transparent bg-error-100 text-error-700',
        info: 'border-transparent bg-info-100 text-info-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// Status-specific badges with icons
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<
    string,
    { variant: 'success' | 'warning' | 'error' | 'info' | 'secondary'; label: string }
  > = {
    // Runner statuses
    online: { variant: 'success', label: 'Online' },
    offline: { variant: 'secondary', label: 'Offline' },
    busy: { variant: 'warning', label: 'Busy' },
    // Run statuses
    pending: { variant: 'secondary', label: 'Pending' },
    queued: { variant: 'info', label: 'Queued' },
    leased: { variant: 'info', label: 'Leased' },
    running: { variant: 'info', label: 'Running' },
    success: { variant: 'success', label: 'Success' },
    succeeded: { variant: 'success', label: 'Succeeded' },
    failed: { variant: 'error', label: 'Failed' },
    cancelled: { variant: 'warning', label: 'Cancelled' },
    paused: { variant: 'warning', label: 'Paused' },
    waiting_approval: { variant: 'warning', label: 'Waiting Approval' },
    timed_out: { variant: 'error', label: 'Timed Out' },
    retrying: { variant: 'info', label: 'Retrying' },
    retry_scheduled: { variant: 'info', label: 'Retry Scheduled' },
    rejected: { variant: 'error', label: 'Rejected' },
    skipped: { variant: 'secondary', label: 'Skipped' },
    // Bot statuses
    draft: { variant: 'secondary', label: 'Draft' },
    compiled: { variant: 'info', label: 'Compiled' },
    published: { variant: 'success', label: 'Published' },
    active: { variant: 'success', label: 'Active' },
    archived: { variant: 'secondary', label: 'Archived' },
    error: { variant: 'error', label: 'Error' },
    // Schedule statuses
    disabled: { variant: 'secondary', label: 'Disabled' },
    expired: { variant: 'secondary', label: 'Expired' },
    quota_exceeded: { variant: 'warning', label: 'Quota Exceeded' },
    // User statuses
    pending_verification: { variant: 'warning', label: 'Pending Verification' },
    suspended: { variant: 'warning', label: 'Suspended' },
    locked: { variant: 'error', label: 'Locked' },
    deactivated: { variant: 'secondary', label: 'Deactivated' },
    maintenance: { variant: 'warning', label: 'Maintenance' },
    starting: { variant: 'info', label: 'Starting' },
    stopping: { variant: 'warning', label: 'Stopping' },
    draining: { variant: 'warning', label: 'Draining' },
    disabled_runner: { variant: 'secondary', label: 'Disabled' },
  };

  const config = statusConfig[status] || { variant: 'secondary' as const, label: status };

  return (
    <Badge variant={config.variant} className="gap-1">
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          config.variant === 'success' && 'bg-brand-500',
          config.variant === 'warning' && 'bg-warning-500',
          config.variant === 'error' && 'bg-error-500',
          config.variant === 'info' && 'bg-info-500',
          config.variant === 'secondary' && 'bg-zinc-400',
        )}
      />
      {config.label}
    </Badge>
  );
}

export { Badge, badgeVariants, StatusBadge };
