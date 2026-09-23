// Проверка экспортированного письма по своду правил вёрстки (get_all_rules
// v4.4, папка «правила писем»). Не заменяет чтение свода — закрывает те его
// пункты, которые можно проверить по готовому HTML автоматически.
//
//   node scripts/email-rules-check.mjs <файл.html>
//
// Пустой вывод нарушений = письмо прошло проверяемую часть чеклиста.

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Использование: node scripts/email-rules-check.mjs <файл.html>");
  process.exit(2);
}
const html = readFileSync(file, "utf8");

/** Разметка без условных комментариев — в них живёт VML и настройки Outlook. */
const withoutConditionals = html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, "");

const checks = [
  {
    id: 1,
    rule: "DOCTYPE + xmlns:v + мета тёмной темы",
    ok: () =>
      html.startsWith('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"') &&
      html.includes('xmlns:v="urn:schemas-microsoft-com:vml"') &&
      html.includes('name="color-scheme"') &&
      html.includes('name="supported-color-schemes"'),
  },
  {
    id: 2,
    rule: "border-collapse:separate, не collapse",
    ok: () => html.includes("border-collapse:separate") && !html.includes("border-collapse:collapse"),
  },
  {
    id: 3,
    rule: "Внешняя таблица 100% → внутренняя 600px",
    ok: () => /<table width="100%"/.test(html) && /<table width="600"/.test(html),
  },
  {
    id: 4,
    rule: "Нет div / section / article",
    ok: () => !/<(div|section|article)\b/i.test(html),
  },
  {
    id: 5,
    rule: "Нет background-image в style (Gmail его удаляет)",
    ok: () => !/background-image\s*:/i.test(html),
  },
  {
    id: 7,
    rule: "Нет Google Fonts и внешних шрифтов",
    ok: () => !/fonts\.googleapis|@font-face|@import/i.test(html),
  },
  {
    id: 8,
    rule: "Кнопка: <a> внутри <td>, display:block, явные width/height/line-height",
    ok: () => {
      const links = [...html.matchAll(/<a\b[^>]*style="([^"]*)"[^>]*>/g)].map((m) => m[1]);
      const buttons = links.filter((s) => s.includes("display:block"));
      if (buttons.length === 0) return true; // письмо без кнопок — нечего проверять
      return buttons.every(
        (s) => /width:\d+px/.test(s) && /height:\d+px/.test(s) && /line-height:\d+px/.test(s),
      );
    },
  },
  {
    id: "8b",
    rule: "Нет <table> внутри <a> (невалидно по спецификации)",
    // Останавливаемся на </a>: иначе таблица, стоящая уже ПОСЛЕ ссылки,
    // считалась вложенной в неё.
    ok: () => !/<a\b[^>]*>(?:(?!<\/a>)[\s\S]){0,400}?<table/i.test(html),
  },
  {
    id: 13,
    rule: "У таблиц с фиксированной шириной есть и width, и min-width",
    ok: () => {
      const fixed = [...html.matchAll(/<table[^>]*width="(\d+)"[^>]*style="([^"]*)"/g)];
      return fixed.every(([, w, style]) => style.includes(`width:${w}px`) && style.includes(`min-width:${w}px`));
    },
  },
  {
    id: 31,
    rule: "Нет строк с display:none",
    ok: () => !/display\s*:\s*none/i.test(html),
  },
  {
    id: 32,
    rule: "Фон письма на body и на внешней таблице (иначе в Gmail обрыв под футером)",
    ok: () =>
      /<body[^>]*background-color:#[0-9a-f]{6}/i.test(html) &&
      /<table width="100%"[^>]*bgcolor="#[0-9a-f]{6}"/i.test(html),
  },
  {
    id: 34,
    rule: "Первый символ «<», последний «>», теги закрыты",
    ok: () => {
      if (!html.trim().startsWith("<") || !html.trim().endsWith(">")) return false;
      const open = (html.match(/<table\b/g) || []).length;
      const close = (html.match(/<\/table>/g) || []).length;
      return open === close;
    },
  },
  {
    id: 54,
    rule: "У каждой текстовой ячейки явный line-height",
    ok: () => {
      const cells = [...html.matchAll(/<td\b[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)];
      const offenders = cells.filter(([, style, inner]) => {
        // Ячейка-обёртка вокруг вложенной таблицы — не текстовая: правило
        // требует line-height там, где строки реально верстаются.
        if (/<table\b/i.test(inner)) return false;
        const text = inner.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "").trim();
        if (!text) return false;
        if (style.includes("font-size:0")) return false;
        return !/line-height:\s*\d+px/.test(style);
      });
      return offenders.length === 0;
    },
  },
  {
    id: 56,
    rule: "Нет пояснительных HTML-комментариев (условные для Outlook не в счёт)",
    ok: () => !/<!--(?!\[if)/.test(withoutConditionals.replace(/<!\[endif\]-->/g, "")),
  },
  {
    id: "media",
    rule: "Нет медиазапросов",
    ok: () => !/@media/i.test(html),
  },
  {
    id: "img",
    rule: "У картинок обязательный набор стилей",
    ok: () => {
      const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      return imgs.every(
        (tag) =>
          /display:block/.test(tag) &&
          /border:none/.test(tag) &&
          /-ms-interpolation-mode:bicubic/.test(tag),
      );
    },
  },
  {
    id: "anti-glue",
    rule: "Разные тексты не склеены в одной ячейке (global_anti_glue_rule)",
    ok: () => {
      const cells = [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
      return cells.every(([, inner]) => {
        // Ячейка-обёртка вокруг вложенной таблицы склейкой не считается.
        if (/<table\b/i.test(inner)) return true;
        const spans = [...inner.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)];
        const withText = spans.filter((m) => m[1].replace(/<[^>]+>/g, "").trim());
        return withText.length <= 1;
      });
    },
  },
  {
    id: "margin",
    rule: "Нет margin на таблицах (layout.no_margin)",
    ok: () => !/<table[^>]*style="[^"]*margin:/.test(html),
  },
];

const failed = checks.filter((c) => {
  try {
    return !c.ok();
  } catch (err) {
    console.error(`Проверка ${c.id} упала:`, err);
    return true;
  }
});

if (failed.length === 0) {
  console.log(`OK — ${checks.length} проверок пройдено (${file})`);
  process.exit(0);
}
console.log(`Нарушений: ${failed.length} из ${checks.length}\n`);
for (const f of failed) console.log(`  п.${f.id}: ${f.rule}`);
process.exit(1);
