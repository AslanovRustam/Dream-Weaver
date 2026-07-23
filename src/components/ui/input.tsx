import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // System spec: elevated fill, 8px radius, 40px tall, placeholder in
          // the hint tone, lime border + soft lime ring on focus.
          "flex h-10 w-full rounded-lg border border-border bg-elevated px-3.5 text-sm text-foreground transition file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-hint outline-none focus:border-accent-green focus:shadow-[0_0_0_3px_rgba(198,255,61,0.14)] disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
