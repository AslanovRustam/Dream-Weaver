// Все проверки проекта одной командой — перед коммитом.
//
//   npm run check            всё, включая прогоны в Chromium
//   npm run check -- --fast  без браузера (только типы и статические проверки)
//
// Без сети, базы и кредитов: каждая проверка работает на подделках или
// собирает выгрузку локально. Падает с кодом 1, если упала хоть одна.

import { spawnSync } from "node:child_process";

const fast = process.argv.includes("--fast");
const tsx = (file) => ["npx", "--yes", "tsx", file];

const CHECKS = [
  { name: "Типы (tsc)", cmd: ["npx", "tsc", "--noEmit"] },
  { name: "Очередь задач", cmd: tsx("scripts/jobs-driver-check.mts") },
  { name: "Ключи интеграций", cmd: tsx("scripts/integrations-check.mts") },
  { name: "Шаблоны писем", cmd: tsx("scripts/email-templates-check.mts") },
  { name: "Мои проекты", cmd: tsx("scripts/projects-check.mts") },
  { name: "Кампания", cmd: tsx("scripts/campaign-check.mts") },
  { name: "Плейблы: сцены × сети × языки", cmd: tsx("scripts/scene-export-check.mts") },
  { name: "Лендинги-механики", cmd: tsx("scripts/landing-export-check.mts"), browser: true },
  { name: "Лендинги на сценах", cmd: tsx("scripts/scene-landing-check.mts"), browser: true },
];

const results = [];
for (const c of CHECKS) {
  if (fast && c.browser) {
    results.push({ ...c, status: "skip", ms: 0 });
    continue;
  }
  process.stdout.write(`\n▶ ${c.name}\n`);
  const t0 = Date.now();
  const r = spawnSync(c.cmd[0], c.cmd.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
  results.push({ ...c, status: r.status === 0 ? "ok" : "fail", ms: Date.now() - t0 });
}

console.log("\n──────── итог");
for (const r of results) {
  const mark = r.status === "ok" ? "✓" : r.status === "skip" ? "–" : "✗";
  const time = r.status === "skip" ? "пропущено (--fast)" : `${(r.ms / 1000).toFixed(1)} с`;
  console.log(`${mark} ${r.name.padEnd(34)} ${time}`);
}
const failed = results.filter((r) => r.status === "fail").length;
console.log(failed ? `\n${failed} проверок упало` : "\nВсё зелёное");
process.exit(failed ? 1 : 0);
