"use client";

// Default USER avatar. Shows the uploaded photo when the user has set one;
// otherwise a NEUTRAL ILLUSTRATIVE placeholder — a line "person" glyph on a
// soft brand-violet gradient, never a stock photo. Fills its parent, which sets
// the size (h-9 w-9, h-16 w-16, …) and may add a ring.
import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

export function UserAvatar({ src, className }: { src?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center"
          style={{ backgroundImage: "var(--grad-violet)" }}
          aria-hidden
        >
          <UserRound className="h-1/2 w-1/2 text-white" strokeWidth={1.75} />
        </span>
      )}
    </span>
  );
}
