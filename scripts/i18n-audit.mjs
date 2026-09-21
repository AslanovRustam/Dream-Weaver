// i18n coverage audit.
//
// Counts Cyrillic string literals that are still hard-coded in the source, so
// the size of the remaining job is a number rather than a feeling. A literal
// counts when it sits in a string or in JSX text; comments are skipped, and so
// is the dictionary itself.
//
//   node scripts/i18n-audit.mjs            → per-file totals, worst first
//   node scripts/i18n-audit.mjs --list src/components/AppSidebar.tsx
//                                          → the actual strings in one file

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const SKIP_DIRS = new Set(["node_modules", ".next", "i18n"]);
const CYRILLIC = /[А-Яа-яЁёЇїІіЄєҐґ]/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(p, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/** Strip // and /* *​/ comments so a Russian comment is not counted as copy. */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function stringsIn(code) {
  const body = stripComments(code);
  const found = [];
  // Quoted literals and template strings.
  for (const m of body.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (CYRILLIC.test(m[2])) found.push(m[2].trim());
  }
  // JSX text between tags: >…<
  for (const m of body.matchAll(/>([^<>{}]{2,})</g)) {
    const t = m[1].trim();
    if (t && CYRILLIC.test(t)) found.push(t);
  }
  return found;
}

const files = walk(SRC);
const listFile = process.argv.includes("--list")
  ? process.argv[process.argv.indexOf("--list") + 1]
  : null;

if (listFile) {
  const abs = join(ROOT, listFile);
  for (const s of stringsIn(readFileSync(abs, "utf8"))) console.log("·", s);
  process.exit(0);
}

const rows = [];
let total = 0;
for (const f of files) {
  const n = stringsIn(readFileSync(f, "utf8")).length;
  if (n === 0) continue;
  total += n;
  rows.push({ file: relative(ROOT, f).replace(/\\/g, "/"), n });
}
rows.sort((a, b) => b.n - a.n);

console.log(`Непереведённых строк: ${total} в ${rows.length} файлах\n`);
for (const r of rows.slice(0, 40)) {
  console.log(String(r.n).padStart(5), r.file);
}
if (rows.length > 40) {
  const rest = rows.slice(40).reduce((s, r) => s + r.n, 0);
  console.log(`${String(rest).padStart(5)} ещё в ${rows.length - 40} файлах`);
}
