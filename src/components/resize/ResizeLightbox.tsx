// ResizeLightbox — fullscreen viewer for a SINGLE resize tile, opened on top
// of the resize modal (step 3). It portals to <body> at a z-index above the
// Radix dialog (z-50) so the underlying "Выбрать ресайз" modal stays mounted
// and keeps its scroll/progress — closing this layer just returns to the list.
//
// - Desktop: click backdrop or the ✕ to close; Escape too (captured so it does
//   NOT also close the parent dialog).
// - Mobile: full-screen; swipe the image down past a threshold to dismiss.
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import type { BatchTile } from "@/lib/generation-context";

export function ResizeLightbox({ tile, onClose }: { tile: BatchTile; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  // Vertical drag offset for the mobile swipe-to-dismiss gesture.
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  // Close on Escape, but capture the event and stop it before Radix's dialog
  // (which also listens for Escape) can react and tear down the whole modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Lock body scroll while the lightbox is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;

  const { size, dataUrl } = tile;
  const caption = size.label ? `${size.label} — ${size.w}×${size.h}` : `${size.w}×${size.h}`;

  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current == null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    // Only track downward drags.
    setDragY(dy > 0 ? dy : 0);
  };
  const onTouchEnd = () => {
    if (dragY > 110) onClose();
    else setDragY(0);
    dragStart.current = null;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={caption}
    >
      {/* Top bar: caption + close */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm font-medium sm:text-base">{caption}</span>
        <button
          type="button"
          aria-label="Закрыть просмотр"
          onClick={onClose}
          className="shrink-0 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Image stage */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-8 sm:px-6">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={caption}
            className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
            style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            draggable={false}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
