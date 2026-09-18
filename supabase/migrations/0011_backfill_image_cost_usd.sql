-- Backfill $ cost for image generations that were logged with cost_usd = 0.
--
-- Until Sep 2026 the OpenAI-direct image routes stored token counts but no $
-- (OpenAI returns no price in the response). The app now prices tokens itself
-- (src/lib/openai-pricing.ts); this brings the historical ledger in line so
-- the admin «Расход» tab shows real spend for the last months too.
--
-- gpt-image-2.5 (sunburst / flare — and rows labelled with the old pricing
-- key "gpt-image-2", which were the same calls): input tokens (text + image)
-- $8 / 1M, output image tokens $30 / 1M.
--
-- Idempotent: only touches rows with cost_usd = 0 and some token count.

update public.generations
set cost_usd = round(
  ((coalesce(tokens_input_text, 0) + coalesce(tokens_input_image, 0)) * 8.0
    + coalesce(tokens_output, 0) * 30.0) / 1000000.0,
  6)
where coalesce(cost_usd, 0) = 0
  and coalesce(total_tokens, 0) > 0
  and (model in ('gpt-image-2', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare')
       or model like 'gpt-image-2.5%');

-- Rows written by recordUsage for the flat-price image routes before this
-- change carry NO token counts at all (cost was hard-coded 0) — nothing to
-- price; they stay at 0 and are excluded by the total_tokens guard above.
