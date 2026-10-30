import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-mono transition-colors select-none shadow-none',
  {
    variants: {
      variant: {
        default:
          'border-border bg-secondary text-secondary-foreground hover:bg-accent',
        secondary:
          'border-transparent bg-muted text-muted-foreground hover:text-foreground',
        outline:
          'border-border text-foreground hover:bg-secondary',
        active:
          'border-white bg-white text-black font-semibold',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
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

export { Badge, badgeVariants };
