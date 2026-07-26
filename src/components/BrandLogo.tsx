"use client";

// Product logo, swappable by file — no logo art is baked into the code.
//
// The client's Gen-GO logo is a temporary drop-in: replace ONE file at
// `public/brand/logo.svg` (or point BRAND_LOGO_SRC at a .png) and it appears
// everywhere the logo renders — header (desktop + mobile), login screen — with
// no code change.
//
// Until that file exists the component renders `fallback` (the current text
// wordmark), so a missing file is never a broken image: the hidden <img> tries
// to load, and only on success (onLoad) does it swap in and hide the text.
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Single source of truth for the logo path. Swap the file at this public path,
 *  or change the extension here if the export is a PNG. */
export const BRAND_LOGO_SRC = "/brand/logo.svg";

export function BrandLogo({
  className,
  fallback,
  alt = "",
}: {
  /** Sizing for the <img> — height-constrained with w-auto keeps any aspect
   *  ratio undistorted, e.g. "h-7 max-sm:h-6". */
  className?: string;
  /** Shown until the image loads (and forever if the file is absent). */
  fallback: React.ReactNode;
  /** Accessible name. Leave "" when a wrapping link already names the logo. */
  alt?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // A local SVG often finishes loading before React attaches onLoad (or is
  // served from cache), so that event can be missed and the logo would stay
  // stuck on the text fallback. On mount, check the element directly:
  // complete + naturalWidth > 0 means it loaded; naturalWidth 0 means the file
  // is absent/broken, so we keep the fallback.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <>
      <img
        ref={ref}
        src={BRAND_LOGO_SRC}
        alt={alt}
        loading="eager"
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth > 0) setLoaded(true);
        }}
        // Hidden until it successfully loads, so a missing file never shows the
        // browser's broken-image icon — the text fallback shows instead.
        className={cn("w-auto select-none", className, loaded ? "" : "hidden")}
        draggable={false}
      />
      {!loaded ? fallback : null}
    </>
  );
}
