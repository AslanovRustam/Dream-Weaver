-- Backfill $ cost for the rows 0011 did not cover.
--
-- 0011 priced the OpenAI image models only. Two more groups were logged with
-- token counts but cost_usd = 0, because token-side pricing
-- (src/lib/openai-pricing.ts) landed only on 2026-09-18:
--
--   1. gpt-4o-mini  — 24 rows. Priced from OpenAI's list: $0.15 / 1M input,
--      $0.60 / 1M output. Exact, same numbers the app now uses at write time.
--
--   2. gemini-nano  — 22 rows. These came through OpenRouter, which returned
--      `usage.cost` per call; the rows that have it average $18.13 / 1M tokens
--      (21 rows, 83 510 tokens, $1.5138). The 22 rows without it predate that
--      and carry no per-call price, so they are ESTIMATED at the same rate.
--      Estimate, not invoice — see the separate statement below if you would
--      rather leave them at zero.
--
-- Idempotent: only touches rows with cost_usd = 0 and a token count, so a
-- repeat run is a no-op. Rows with no tokens at all (client-crop, the
-- flat-price image routes before the change) stay at 0 — nothing to price.

-- 1. gpt-4o-mini — exact list pricing.
update public.generations
set cost_usd = round(
  (coalesce(tokens_input_text, 0) * 0.15 + coalesce(tokens_output, 0) * 0.60) / 1000000.0,
  6)
where coalesce(cost_usd, 0) = 0
  and coalesce(total_tokens, 0) > 0
  and (
    model like 'gpt-4o-mini%'
    or model like 'openai/gpt-4o-mini%'
    or model like 'gpt-5.4-mini%'
    or model like 'openai/gpt-5.4-mini%'
  );

-- 2. gemini-nano — rate derived from the rows OpenRouter did price.
--    Drop this statement if an estimated figure in the ledger is unacceptable;
--    it accounts for roughly $0.83 across 22 rows.
update public.generations
set cost_usd = round(coalesce(total_tokens, 0) * 18.13 / 1000000.0, 6)
where coalesce(cost_usd, 0) = 0
  and coalesce(total_tokens, 0) > 0
  and (model like 'gemini-nano%' or model like 'google/gemini%');
