import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          // Same field treatment as <Input> — see input.tsx.
          "flex min-h-[80px] w-full rounded-lg border border-border bg-elevated px-3.5 py-2.5 text-sm text-foreground transition placeholder:text-hint outline-none focus:border-accent-green focus:shadow-[0_0_0_3px_rgba(198,255,61,0.14)] disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
