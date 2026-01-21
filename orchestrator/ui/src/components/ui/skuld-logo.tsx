import { cn } from '@/lib/utils';

interface SkuldLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function SkuldLogo({ className, size = 'md', showText = true }: SkuldLogoProps) {
  const sizeConfig = {
    sm: { icon: 'w-6 h-6', text: 'text-sm' },
    md: { icon: 'w-8 h-8', text: 'text-lg' },
    lg: { icon: 'w-10 h-10', text: 'text-xl' },
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn(
        'rounded-lg bg-primary/10 flex items-center justify-center',
        sizeConfig[size].icon
      )}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={cn('text-primary', size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6')}
        >
          {/* Lightning bolt / automation symbol */}
          <path
            d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
            fill="currentColor"
            fillOpacity="0.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn('font-bold text-foreground', sizeConfig[size].text)}>
          SkuldBot
        </span>
      )}
    </div>
  );
}

// Variant for dark backgrounds (sidebar)
export function SkuldLogoDark({ className, size = 'md', showText = true }: SkuldLogoProps) {
  const sizeConfig = {
    sm: { icon: 'w-6 h-6', text: 'text-sm' },
    md: { icon: 'w-8 h-8', text: 'text-lg' },
    lg: { icon: 'w-10 h-10', text: 'text-xl' },
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn(
        'rounded-lg bg-sidebar-primary/20 flex items-center justify-center',
        sizeConfig[size].icon
      )}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={cn('text-sidebar-primary', size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6')}
        >
          <path
            d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
            fill="currentColor"
            fillOpacity="0.3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn('font-bold text-sidebar-foreground', sizeConfig[size].text)}>
          SkuldBot
        </span>
      )}
    </div>
  );
}
