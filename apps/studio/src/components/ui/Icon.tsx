import * as LucideIcons from "lucide-react";
import { cn } from "../../lib/utils";

interface IconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 16, strokeWidth = 1.75, className }: IconProps) {
  const LucideIcon = (LucideIcons as any)[name] || LucideIcons.Circle;
  return <LucideIcon size={size} strokeWidth={strokeWidth} className={className} />;
}

// Icon with background container
interface IconBoxProps extends IconProps {
  variant?: "default" | "muted";
  boxSize?: "sm" | "md" | "lg";
  bgClassName?: string;
}

export function IconBox({
  name,
  size,
  strokeWidth = 1.75,
  className,
  variant = "default",
  boxSize = "md",
  bgClassName,
}: IconBoxProps) {
  const boxSizes = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-10 h-10",
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 20,
  };

  return (
    <div className={cn(
      "rounded-lg flex items-center justify-center flex-shrink-0",
      boxSizes[boxSize],
      variant === "muted" && "bg-neutral-100",
      bgClassName
    )}>
      <Icon
        name={name}
        size={size || iconSizes[boxSize]}
        strokeWidth={strokeWidth}
        className={className}
      />
    </div>
  );
}
