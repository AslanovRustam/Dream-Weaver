import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Status pill per the design system: fully rounded, tinted fill, 12/600.
 * The system's rule is that colour never carries the meaning alone — pair a
 * status variant with a leading <span className="ds-dot" /> and a text label.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-elevated text-secondary-foreground hover:bg-elevated-2",
        destructive:
          "border-transparent bg-[color:var(--danger-tint)] text-[color:var(--danger)]",
        success: "border-transparent bg-[color:var(--success-tint)] text-[color:var(--success)]",
        warning: "border-transparent bg-[color:var(--warning-tint)] text-[color:var(--warning)]",
        info: "border-transparent bg-[color:var(--info-tint)] text-[color:var(--info)]",
        outline: "border-[color:var(--border-strong)] text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
