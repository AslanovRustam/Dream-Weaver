#!/usr/bin/env node
/**
 * remap-user-ids.mjs — переписывает старые UUID пользователей (auth.users)
 * на новые в CSV-экспортах Dream Weaver, чтобы историю можно было залить в
 * НОВЫЙ проект Supabase после того, как пользователи там зарегистрировались.
 *
 * Как это работает:
 *   1. Старые profiles_rows.csv дают соответствие  oldUUID -> email.
 *   2. Вы передаёте map  email -> newUUID  (JSON), собранный из нового проекта
 *      (после регистрации: Supabase -> Auth -> Users, или select id,email from profiles).
 *   3. Скрипт строит  oldUUID -> newUUID  и переписывает UUID-колонки в каждой
 *      user-привязанной таблице.
 *   4. Строки, у которых обязательный user_id не удалось сопоставить, ОТБРАСЫВАЮТСЯ
 *      (иначе FK-ошибка). В необязательных FK-колонках несопоставленный UUID -> NULL.
 *   5. Результат — *_remapped.csv в выходной папке, готовые к \copy.
 *
 * Запуск:
 *   node scripts/remap-user-ids.mjs --map user-id-map.json \
 *     --dir "D:/projects/clickable/Скобелєв Віктор/Table-SQL" \
 *     --out "D:/projects/clickable/Скобелєв Віктор/Table-SQL/remapped"
 *
 * Формат user-id-map.json:
 *   { "aslanov@clickable.agency": "new-uuid-1", "skobelev@clickable.agency": "new-uuid-2" }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---- аргументы ----
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DIR = arg("dir", "D:/projects/clickable/Скобелєв Віктор/Table-SQL");
const OUT = arg("out", join(DIR, "remapped"));
const MAP = arg("map", "user-id-map.json");

// Какие колонки в каких файлах содержат UUID пользователей и обязательны ли они.
// required=true  -> строка без валидного маппинга ОТБРАСЫВАЕТСЯ.
// required=false -> несопоставленный UUID заменяется на пустую строку (NULL при импорте).
const TABLES = [
  { file: "profiles_rows.csv",            cols: [["id", true]] },
  { file: "generation_cards_rows.csv",    cols: [["user_id", true]] },
  { file: "generations_rows.csv",         cols: [["user_id", true]] },
  { file: "credit_transactions_rows.csv", cols: [["user_id", true], ["admin_id", false]] },
  { file: "audit_logs_rows.csv",          cols: [["user_id", false], ["target_user_id", false]] },
  { file: "system_logs_rows.csv",         cols: [["user_id", false]] },
];

// ---- минимальный RFC4180 CSV parser/stringifier ----
function parseCSV(text) {
  const rows = [];
  let field = "";
  let row = [];
  let i = 0;
  let inQuotes = false;
  // strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  // last field/row (if file doesn't end with newline)
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return { header, rows };
}

function needsQuote(s) {
  return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r");
}
function stringifyCSV(header, rows) {
  const enc = (s) => (needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [header.map(enc).join(",")];
  for (const r of rows) lines.push(r.map(enc).join(","));
  return lines.join("\r\n") + "\r\n";
}

// ---- 1. old profiles -> oldUUID -> email ----
const profilesPath = join(DIR, "profiles_rows.csv");
if (!existsSync(profilesPath)) { console.error(`Не найден ${profilesPath}`); process.exit(1); }
const { header: pHeader, rows: pRows } = parseCSV(readFileSync(profilesPath, "utf8"));
const pIdIdx = pHeader.indexOf("id");
const pEmailIdx = pHeader.indexOf("email");
if (pIdIdx === -1 || pEmailIdx === -1) { console.error("В profiles нет колонок id/email"); process.exit(1); }
const oldIdToEmail = new Map();
for (const r of pRows) oldIdToEmail.set(r[pIdIdx], (r[pEmailIdx] || "").toLowerCase());

// ---- 2. email -> newUUID ----
if (!existsSync(MAP)) {
  console.error(`Не найден файл маппинга ${MAP}. Формат: { "email": "new-uuid", ... }`);
  process.exit(1);
}
const emailToNew = new Map(
  Object.entries(JSON.parse(readFileSync(MAP, "utf8"))).map(([e, id]) => [e.toLowerCase(), id]),
);

// ---- 3. oldUUID -> newUUID ----
const oldToNew = new Map();
for (const [oldId, email] of oldIdToEmail) {
  const nu = emailToNew.get(email);
  if (nu) oldToNew.set(oldId, nu);
}
console.log(`Соответствий old->new UUID: ${oldToNew.size} из ${oldIdToEmail.size} профилей`);
const unmapped = [...oldIdToEmail.entries()].filter(([id]) => !oldToNew.has(id));
if (unmapped.length) {
  console.log("Без маппинга (нет в user-id-map.json):");
  for (const [, email] of unmapped) console.log(`  - ${email}`);
}

// ---- 4/5. переписываем и пишем результат ----
mkdirSync(OUT, { recursive: true });
for (const { file, cols } of TABLES) {
  const src = join(DIR, file);
  if (!existsSync(src)) { console.log(`(пропуск) нет файла ${file}`); continue; }
  const { header, rows } = parseCSV(readFileSync(src, "utf8"));
  const colIdx = cols.map(([name, req]) => [header.indexOf(name), req, name]);
  let dropped = 0, nulled = 0;
  const out = [];
  for (const r of rows) {
    let drop = false;
    for (const [idx, req] of colIdx) {
      if (idx === -1) continue;
      const oldVal = r[idx];
      if (!oldVal) continue; // уже пусто
      const nu = oldToNew.get(oldVal);
      if (nu) { r[idx] = nu; }
      else if (req) { drop = true; break; }
      else { r[idx] = ""; nulled++; }
    }
    if (drop) { dropped++; continue; }
    out.push(r);
  }
  const dest = join(OUT, file.replace("_rows.csv", "_remapped.csv"));
  writeFileSync(dest, stringifyCSV(header, out), "utf8");
  console.log(`${file}: ${out.length} строк -> ${dest}  (отброшено ${dropped}, обнулено FK ${nulled})`);
}

console.log("\nГотово. Импортируйте remapped-CSV в порядке FK:");
console.log("  profiles(balance через temp) -> generation_cards -> generations -> credit_transactions -> audit_logs -> system_logs");
