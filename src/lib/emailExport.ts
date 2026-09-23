// Email HTML export — собран по внутреннему своду правил вёрстки писем
// (get_all_rules v4.4, папка «правила писем»). Свод писался под конвейер
// Figma → HTML, поэтому часть его — про маппинг данных фигмы, которых у нас
// нет: конструктор собирает письмо из формы. Здесь применены разделы, которые
// говорят про сам HTML: layout, head_template, cta_structure, assembly и
// чеклист.
//
// Что это значит на практике (и чем отличается от «просто HTML»):
//   • разметка только table/tr/td, никаких div — их запрещает layout.forbidden;
//   • никаких медиазапросов: Outlook и часть мобильных клиентов их не читают,
//     а свод требует, чтобы вёрстка не зависела от них вовсе;
//   • border-collapse:separate (чеклист п.2) — с collapse Outlook схлопывает
//     границы ячеек и ломает отступы;
//   • у каждой таблицы с фиксированной шириной width И min-width в style
//     (п.13), иначе Apple Mail и Gmail её сжимают;
//   • у каждой текстовой ячейки явный line-height (п.54) — без него строки
//     наезжают друг на друга;
//   • расстояние между блоками — padding-top на следующем, не padding-bottom
//     на предыдущем (п.21);
//   • bgcolor только там, где фон реально отличается от родительского (п.6),
//     при этом собственная плашка футера рисуется (п.57);
//   • кнопка по cta_structure: <a> внутри <td>, никогда <table> внутри <a>,
//     display:block с явными width/height и line-height для центровки — так
//     клик срабатывает по всей кнопке, а не по надписи.
//
// Текст пользователя проходит через esc(); ссылка кнопки — через safeCtaUrl(),
// который отсекает javascript: и пропускает макросы трекера как есть.

import { safeCtaUrl } from "./exportUtils";
import type { EmailDraft } from "./mailing";

const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOT = /"/g;

function esc(s: string | undefined): string {
  return (s ?? "")
    .replace(AMP, "&amp;")
    .replace(LT, "&lt;")
    .replace(GT, "&gt;")
    .replace(QUOT, "&quot;");
}

/** Разметка `**жирный**` из полей конструктора — в <strong> акцентного цвета. */
function md(text: string | undefined, accent: string): string {
  return (text ?? "")
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) => {
      const hit = /^\*\*([^*]+)\*\*$/.exec(part);
      return hit
        ? `<strong style="color:${accent};font-weight:bold;">${esc(hit[1])}</strong>`
        : esc(part);
    })
    .join("");
}

function mdMultiline(text: string | undefined, accent: string): string {
  return md(text, accent).split("\n").join("<br />");
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// Свод: если fontFamily не задан — Arial,Helvetica,sans-serif, без дублей в
// стеке. Веб-шрифты (Google Fonts) запрещены отдельным пунктом.
const FONT = "Arial,Helvetica,sans-serif";

/** Обязательный набор стилей для картинок из layout.images. */
const IMG_STYLE = "display:block;border:none;max-width:100%;-ms-interpolation-mode:bicubic;";

type Palette = {
  accent: string;
  /** Фон письма — идёт на body, внешнюю таблицу и её td (сборка, п.3). */
  page: string;
  /** Полотно письма: отличается от фона страницы, поэтому bgcolor разрешён. */
  panel: string;
  text: string;
  muted: string;
  footerBg: string;
  divider: string;
  chipBg: string;
  onAccent: string;
};

function palette(draft: EmailDraft): Palette {
  const accent = HEX.test(draft.accent) ? draft.accent : "#22c55e";
  return draft.dark
    ? {
        accent,
        page: "#060a16",
        panel: "#0b1226",
        text: "#eaf0ff",
        muted: "#93a4cc",
        footerBg: "#080d1c",
        divider: "#1b2440",
        chipBg: "#131c33",
        onAccent: "#ffffff",
      }
    : {
        accent,
        page: "#e9edf2",
        panel: "#ffffff",
        text: "#0f172a",
        muted: "#475569",
        footerBg: "#f7f8fa",
        divider: "#eef1f4",
        chipBg: "#f1f3f7",
        onAccent: "#ffffff",
      };
}

/** Текстовая ячейка: line-height обязателен (чеклист п.54). */
function textCell(html: string, opts: {
  color: string;
  size: number;
  lineHeight: number;
  weight?: string;
  align?: string;
  transform?: string;
  padding: string;
}): string {
  const weight = opts.weight ? `font-weight:${opts.weight};` : "";
  const transform = opts.transform ? `text-transform:${opts.transform};` : "";
  return `<td align="${opts.align ?? "center"}" style="padding:${opts.padding};font-family:${FONT};font-size:${opts.size}px;line-height:${opts.lineHeight}px;color:${opts.color};${weight}${transform}text-align:${opts.align ?? "center"};">${html}</td>`;
}

/**
 * Кнопка по cta_structure / чеклист п.8: ссылка внутри ячейки, display:block,
 * явные width и height, line-height равен высоте за вычетом вертикальных
 * паддингов. Никакого <table> внутри <a> — это невалидный HTML, и часть
 * клиентов рвёт такую разметку.
 */
function button(label: string, href: string, p: Palette, width = 440): string {
  if (!label.trim()) return "";
  const innerWidth = width - 32;
  const innerHeight = 22;
  return `<table width="${width}" cellpadding="0" cellspacing="0" border="0" align="center" style="width:${width}px;min-width:${width}px;border-collapse:separate;">
                <tr>
                  <td bgcolor="${p.accent}" style="background-color:${p.accent};border-radius:26px;padding:15px 16px;text-align:center;">
                    <a href="${esc(href)}" target="_blank" style="display:block;width:${innerWidth}px;height:${innerHeight}px;line-height:${innerHeight}px;font-family:${FONT};font-size:16px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:${p.onAccent};text-decoration:none;text-align:center;">${esc(label)}</a>
                  </td>
                </tr>
              </table>`;
}

// roles.hero в своде требует background= на таблице с высотой из данных и
// запрещает <img>. Высота там приходит из фигмы; у нас баннер загружает
// пользователь, и его высота неизвестна до отрисовки — таблица с background=
// без height схлопнется в ничто. Поэтому картинка остаётся <img> во всю
// ширину: зон с кликами у неё нет, а именно ради них правило и написано.
function heroBlock(draft: EmailDraft, p: Palette): string {
  if (draft.heroImage) {
    return `        <tr>
          <td style="font-size:0;line-height:0;"><img src="${esc(draft.heroImage)}" width="600" alt="" style="${IMG_STYLE}width:600px;" /></td>
        </tr>`;
  }
  const inner =
    draft.brandMode === "logo" && draft.logo
      ? `<img src="${esc(draft.logo)}" width="180" alt="${esc(draft.brand)}" style="${IMG_STYLE}margin:0 auto;" />`
      : `<span style="font-family:${FONT};font-size:28px;line-height:34px;font-weight:bold;color:${p.text};">${esc(draft.brand || "ВАШ БРЕНД")}</span>`;
  return `        <tr>
          <td align="center" bgcolor="${p.chipBg}" style="background-color:${p.chipBg};padding:44px 24px;font-family:${FONT};font-size:28px;line-height:34px;">${inner}</td>
        </tr>`;
}

function stepsBlock(draft: EmailDraft, p: Palette): string {
  const steps = (draft.steps ?? []).filter((s) => s.trim());
  if (steps.length === 0) return "";
  // universal_gap: соседей разделяет padding-top у следующего, а не
  // padding-bottom у предыдущего — иначе последний шаг тащит за собой лишний
  // отступ, которого в макете нет.
  const rows = steps
    .map(
      (step, i) => `                    <tr>
                      <td width="24" valign="top" style="padding:${i === 0 ? "14px" : "10px"} 12px 0 0;">
                        <table width="24" cellpadding="0" cellspacing="0" border="0" style="width:24px;min-width:24px;border-collapse:separate;">
                          <tr>
                            <td width="24" height="24" align="center" valign="middle" bgcolor="${p.accent}" style="width:24px;height:24px;background-color:${p.accent};border-radius:12px;font-family:${FONT};font-size:12px;line-height:24px;font-weight:bold;color:${p.onAccent};text-align:center;">${i + 1}</td>
                          </tr>
                        </table>
                      </td>
                      <td valign="top" style="padding:${i === 0 ? "14px" : "10px"} 0 0 0;font-family:${FONT};font-size:14px;line-height:20px;color:${p.muted};">${md(step, p.accent)}</td>
                    </tr>`,
    )
    .join("\n");
  return `              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">
                    <tr>
                      <td colspan="2" align="center" style="padding:0;font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;text-transform:uppercase;color:${p.text};text-align:center;">Чтобы активировать бонус:</td>
                    </tr>
${rows}
              </table>`;
}

const PAYMENTS = ["VISA", "Mastercard", "Skrill", "NETELLER", "Yandex", "QIWI", "Trustly"];
const STORES = ["App Store", "Google Play"];

/** Ряд «магазины приложений» и ряд платёжных систем — ячейками, без div. */
function extrasBlock(p: Palette): string {
  const stores = STORES.map(
    (name) =>
      `<td align="center" style="padding:0 4px;font-family:${FONT};font-size:11px;line-height:17px;color:${p.muted};"><span style="display:inline-block;padding:6px 12px;border:1px solid ${p.divider};border-radius:8px;">${esc(name)}</span></td>`,
  ).join("");
  // global_anti_glue_rule: разные подписи нельзя складывать в одну ячейку —
  // ни через <br/>, ни через два <span> подряд, ни через &nbsp;. Они стоят в
  // одной горизонтальной полосе, значит это ряд из колонок
  // (universal_gap.horizontal_case), а не склейка.
  const chips = PAYMENTS.map(
    (name) =>
      `<td align="center" style="padding:0 2px;font-family:${FONT};font-size:10px;line-height:14px;font-weight:bold;color:${p.muted};"><span style="display:inline-block;padding:3px 8px;border-radius:4px;background-color:${p.chipBg};">${esc(name)}</span></td>`,
  ).join("");
  return `        <tr>
          <td align="center" style="padding:24px 24px 24px 24px;border-top:1px solid ${p.divider};">
            <table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;">
              <tr>
                <td align="center" style="padding:0;font-family:${FONT};font-size:12px;line-height:18px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:${p.muted};text-align:center;">Download our mobile app</td>
              </tr>
              <tr>
                <td align="center" style="padding:12px 0 0 0;">
                  <table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;">
                    <tr>${stores}</tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:14px 0 0 0;">
                  <table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;">
                    <tr>${chips}</tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/**
 * Футер. Свод запрещает дублировать фон письма на футере, но требует рисовать
 * его собственную плашку (чеклист п.57) — здесь она своя и от полотна
 * отличается, поэтому bgcolor правомерен. Ссылка отписки всегда без
 * подчёркивания по умолчанию (roles.footer).
 */
function footerBlock(draft: EmailDraft, p: Palette, unsubscribe: string): string {
  return `        <tr>
          <td align="center" bgcolor="${p.footerBg}" style="background-color:${p.footerBg};padding:18px 28px;border-top:1px solid ${p.divider};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">
              <tr>
${textCell(esc(draft.footer), { color: p.muted, size: 11, lineHeight: 17, padding: "0" })}
              </tr>
              <tr>
                <td align="center" style="padding:8px 0 0 0;font-family:${FONT};font-size:11px;line-height:17px;text-align:center;"><a href="${esc(unsubscribe)}" target="_blank" style="font-family:${FONT};font-size:11px;line-height:17px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:${p.accent};text-decoration:none;">Unsubscribe</a></td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/**
 * Готовый файл письма. Его же показывает предпросмотр в конструкторе, поэтому
 * на экране и в почте одно и то же.
 */
export function buildEmailHtml(draft: EmailDraft): string {
  const p = palette(draft);
  // layout.links: плейсхолдер "#", если ссылку не задали.
  const cta = safeCtaUrl(draft.ctaUrl) || "#";
  const unsubscribe = safeCtaUrl(draft.unsubscribeUrl) || "#";
  const title = draft.heroTitle || "Заголовок акции";

  // Единственное осознанное отступление от свода: прехедер — скрытый элемент,
  // а свод запрещает невидимые элементы (чеклист п.31). Там это правило про
  // фальшивые спейсеры в конвейере из фигмы; прехедер же — отдельное поле
  // конструктора и та самая серая строка, которую почтовик показывает рядом с
  // темой. Без него поле в форме ни на что не влияло бы.
  const preheader = draft.preheader
    ? `<table cellpadding="0" cellspacing="0" border="0" style="max-height:0;overflow:hidden;mso-hide:all;border-collapse:separate;"><tr><td style="font-size:1px;line-height:1px;color:${p.page};">${esc(draft.preheader)}${"&#8199;&#65279;&#847; ".repeat(60)}</td></tr></table>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width" /><meta name="x-apple-disable-message-reformatting"/><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(draft.subject || draft.name || "Письмо")}</title><!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--><style type="text/css">img{font-size:0;line-height:0;display:block;border:none;-ms-interpolation-mode:bicubic;max-width:100%}body{font-family:sans-serif;-webkit-font-smoothing:antialiased;margin:0;padding:0;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%}table{border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt}</style></head>
<body style="background-color:${p.page};margin:0;padding:0;">
${preheader}
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.page}" style="width:100%;background-color:${p.page};border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${p.page}" style="background-color:${p.page};padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.panel}" style="width:600px;min-width:600px;background-color:${p.panel};border-radius:16px;border-collapse:separate;">
${heroBlock(draft, p)}
        <tr>
${textCell(md(title, p.accent), {
  color: p.text,
  size: 26,
  lineHeight: 32,
  weight: "bold",
  transform: "uppercase",
  padding: "28px 28px 0 28px",
})}
        </tr>
${
  draft.heroSubtitle
    ? `        <tr>
${textCell(md(draft.heroSubtitle, p.accent), { color: p.muted, size: 14, lineHeight: 20, padding: "8px 28px 0 28px" })}
        </tr>`
    : ""
}
${
  draft.ctaText
    ? `        <tr>
          <td align="center" style="padding:20px 28px 0 28px;">
              ${button(draft.ctaText, cta, p)}
          </td>
        </tr>`
    : ""
}
${
  draft.body
    ? `        <tr>
${textCell(mdMultiline(draft.body, p.accent), { color: p.muted, size: 14, lineHeight: 22, padding: "20px 28px 0 28px" })}
        </tr>`
    : ""
}
${
  stepsBlock(draft, p)
    ? `        <tr>
          <td align="center" style="padding:20px 28px 0 28px;">
${stepsBlock(draft, p)}
          </td>
        </tr>`
    : ""
}
${
  draft.bonusCtaText
    ? `        <tr>
          <td align="center" style="padding:20px 28px 0 28px;">
              ${button(draft.bonusCtaText, cta, p)}
          </td>
        </tr>`
    : ""
}
${extrasBlock(p)}
${footerBlock(draft, p, unsubscribe)}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Имя файла при выгрузке: имя черновика, тема или запасное значение. */
export function emailFileName(draft: EmailDraft): string {
  const base = (draft.name || draft.subject || "email")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "email"}.html`;
}
