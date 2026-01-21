import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow',
        outline: 'text-foreground',
        success: 'border-transparent bg-success/10 text-success',
        warning: 'border-transparent bg-warning/10 text-warning',
        error: 'border-transparent bg-destructive/10 text-destructive',
        info: 'border-transparent bg-primary/10 text-primary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

// Status-specific badges with icons
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { variant: 'success' | 'warning' | 'error' | 'info' | 'secondary'; label: string }> = {
    // Runner statuses
    online: { variant: 'success', label: 'Online' },
    offline: { variant: 'secondary', label: 'Offline' },
    busy: { variant: 'warning', label: 'Busy' },
    // Run statuses
    pending: { variant: 'secondary', label: 'Pending' },
    queued: { variant: 'info', label: 'Queued' },
    running: { variant: 'info', label: 'Running' },
    success: { variant: 'success', label: 'Success' },
    failed: { variant: 'error', label: 'Failed' },
    cancelled: { variant: 'warning', label: 'Cancelled' },
    // Bot statuses
    draft: { variant: 'secondary', label: 'Draft' },
    compiled: { variant: 'info', label: 'Compiled' },
    published: { variant: 'success', label: 'Published' },
  };

  const config = statusConfig[status] || { variant: 'secondary' as const, label: status };

  return (
    <Badge variant={config.variant} className="gap-1">
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        config.variant === 'success' && 'bg-success',
        config.variant === 'warning' && 'bg-warning',
        config.variant === 'error' && 'bg-destructive',
        config.variant === 'info' && 'bg-primary',
        config.variant === 'secondary' && 'bg-muted-foreground',
      )} />
      {config.label}
    </Badge>
  );
}

export { Badge, badgeVariants, StatusBadge };
