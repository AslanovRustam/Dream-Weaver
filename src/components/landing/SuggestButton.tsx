"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

import { apiFetch } from "@/lib/api-client";

// Little "✨ suggest" icon next to a landing field. Asks gpt-4o-mini (via
// /api/landing-suggest) to propose text/prompt for this field from the topic,
// then calls onFill with the result. Disabled until the topic is filled.
export function SuggestButton({
  topic,
  field,
  mechanic,
  onFill,
}: {
  topic: string;
  field: "headline" | "cta" | "bg" | "character";
  mechanic: "wheel" | "slot" | "crash";
  onFill: (text: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const ready = topic.trim().length > 0;

  const run = async () => {
    if (!ready || loading) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/landing-suggest", {
        method: "POST",
        json: { topic, field, mechanic },
      });
      const data = await res.json();
      if (res.ok && typeof data.text === "string" && data.text) onFill(data.text);
    } catch {
      /* best-effort — ignore */
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={!ready || loading}
      title={ready ? "Предложить по тематике (ИИ)" : "Сначала заполните «Тематику»"}
      aria-label="Предложить по тематике"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-accent-green transition hover:border-accent-green/50 hover:bg-accent-green/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
    </button>
  );
}
