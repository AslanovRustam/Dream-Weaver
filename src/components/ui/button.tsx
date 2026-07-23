import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Button hierarchy per the design system: one lime primary per screen, an
 * outlined secondary, a quiet ghost. Primary BRIGHTENS and picks up a lime
 * glow on hover (the system inverts the usual darken-on-hover), and every
 * variant sinks 1px on press. Heights follow the system: sm 32 / md 40 / lg 48.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent text-sm font-semibold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-accent-green text-[color:var(--text-on-accent)] hover:bg-[var(--accent-hover)] hover:shadow-glow-lime",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline:
          "border-[color:var(--border-strong)] bg-transparent hover:border-white/28 hover:bg-[var(--overlay-hover)] hover:text-foreground",
        secondary: "bg-elevated text-secondary-foreground hover:bg-elevated-2",
        ghost: "text-muted-foreground hover:bg-[var(--overlay-hover)] hover:text-foreground",
        link: "text-brand-cyan underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
