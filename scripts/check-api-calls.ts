// Quick one-off query: count yesterday's image-gen API calls.
// Run with: bun run scripts/check-api-calls.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const f of [".env", ".dev.vars"]) {
    const p = resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supa = createClient(url, key, { auth: { persistSession: false } });

const since = new Date();
since.setHours(0, 0, 0, 0);
since.setDate(since.getDate() - 1); // start of yesterday (local)
const until = new Date(since);
until.setDate(until.getDate() + 2); // end of today
const sinceIso = since.toISOString();
const untilIso = until.toISOString();

console.log(`Window: ${sinceIso} → ${untilIso}`);

// image-gen — every successful master / resize-bucket i2i call
const { data: imgGen, error: e1 } = await supa
  .from("system_logs")
  .select("level, message, context, user_id, request_id, duration_ms, created_at")
  .eq("category", "image-gen")
  .gte("created_at", sinceIso)
  .lt("created_at", untilIso)
  .order("created_at", { ascending: true });
if (e1) {
  console.error("system_logs select failed", e1);
  process.exit(1);
}

const successful = (imgGen ?? []).filter((r) => r.level === "info");
const failed = (imgGen ?? []).filter((r) => r.level === "error");

const masters = successful.filter((r) => /master generated/.test(String(r.message ?? "")));
const resizes = successful.filter((r) => /resize generated/.test(String(r.message ?? "")));
const visions = successful.filter((r) => /vision pre-pass succeeded/.test(String(r.message ?? "")));

console.log("\n=== image-gen category in window ===");
console.log(`Total log rows : ${(imgGen ?? []).length}`);
console.log(`  • info       : ${successful.length}`);
console.log(`     • master  : ${masters.length}    (gpt-image-2)`);
console.log(`     • resize  : ${resizes.length}   (gpt-image-2)`);
console.log(`     • vision  : ${visions.length}    (gpt-4o-mini)`);
console.log(`  • error      : ${failed.length}`);

// ai-naming (gpt-4o-mini for card name polishing).
const { data: aiNaming } = await supa
  .from("system_logs")
  .select("level, message")
  .eq("category", "ai-naming")
  .gte("created_at", sinceIso)
  .lt("created_at", untilIso);
const naming = (aiNaming ?? []).filter(
  (r) => r.level === "info" && /card name polished/.test(String(r.message ?? "")),
);
console.log(`\n=== ai-naming category ===`);
console.log(`  card-name calls (gpt-4o-mini): ${naming.length}`);

// Also count generations rows directly (authoritative source — every
// /api/generate-image hit writes one even when logging fails).
const { count: rowsCount, error: e2 } = await supa
  .from("generations")
  .select("id", { count: "exact", head: true })
  .gte("created_at", sinceIso)
  .lt("created_at", untilIso);
if (e2) {
  console.error("generations count failed", e2);
} else {
  console.log(`\n=== generations rows in window ===`);
  console.log(`Total /api/generate-image hits: ${rowsCount}`);
}

// Breakdown by model (gpt-image-2 vs gemini vs ai-naming etc).
const { data: byModel } = await supa
  .from("generations")
  .select("model, is_master, total_tokens, cost_credits")
  .gte("created_at", sinceIso)
  .lt("created_at", untilIso);
if (byModel) {
  const groups = new Map<
    string,
    { count: number; tokens: number; credits: number; master: number; resize: number }
  >();
  for (const r of byModel) {
    const m = r.model ?? "unknown";
    const g = groups.get(m) ?? { count: 0, tokens: 0, credits: 0, master: 0, resize: 0 };
    g.count++;
    g.tokens += Number(r.total_tokens) || 0;
    g.credits += Number(r.cost_credits) || 0;
    if (r.is_master) g.master++;
    else g.resize++;
    groups.set(m, g);
  }
  console.log(`\n=== by model ===`);
  for (const [m, g] of groups.entries()) {
    console.log(
      `  ${m}: ${g.count} calls (master:${g.master} resize:${g.resize}) · ${g.tokens} tokens · ${g.credits.toFixed(2)} кр`,
    );
  }
}

const totalOpenAI = masters.length + resizes.length + visions.length + naming.length;
console.log(`\n=== TOTAL OpenAI hits in window ===`);
console.log(`  ${totalOpenAI}`);
console.log(`     gpt-image-2  : ${masters.length + resizes.length}`);
console.log(`     gpt-4o-mini  : ${visions.length + naming.length}`);

process.exit(0);
