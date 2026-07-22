import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Off = raised neutral track, on = lime with a soft glow, matching the
      // system's "active surfaces glow" cue.
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-primary data-[state=checked]:shadow-glow-lime data-[state=unchecked]:bg-elevated-2",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Light thumb on the neutral track, dark thumb on the lime one — each
        // stays legible against its own background.
        "pointer-events-none block h-4 w-4 rounded-full bg-foreground shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-[color:var(--text-on-accent)] data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
