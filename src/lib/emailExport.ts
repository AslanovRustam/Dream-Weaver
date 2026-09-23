// Email HTML export.
//
// Mail clients are not browsers. Outlook on Windows renders through Word, most
// clients strip <style> or ignore flex/grid, and several rewrite colours for
// dark mode. So this builds the shape every ESP expects:
//
//   • XHTML transitional doctype — what Word's engine wants to see;
//   • nested <table> layout at a fixed 600px, never flex or grid;
//   • every style inline, because Gmail drops the <head> on forwarded mail;
//   • "bulletproof" buttons: a table cell with a background colour, plus a VML
//     round-rect behind an Outlook conditional comment, because Outlook
//     ignores padding on <a> and border-radius entirely;
//   • a hidden preheader, the grey line the inbox shows next to the subject;
//   • one <style> block for the few progressive touches (a media query and
//     prefers-color-scheme) — treated as decoration that may be dropped.
//
// Everything a user typed goes through esc(); the CTA goes through
// safeCtaUrl() so "javascript:" cannot ride along, while tracker macros like
// {clickurl} pass untouched.

import { safeCtaUrl } from "./exportUtils";
import type { EmailDraft } from "./mailing";

const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOT = /"/g;

/** HTML-escape for text nodes and attribute values. */
function esc(s: string | undefined): string {
  return (s ?? "")
    .replace(AMP, "&amp;")
    .replace(LT, "&lt;")
    .replace(GT, "&gt;")
    .replace(QUOT, "&quot;");
}

/**
 * The same `**bold**` shorthand the builder's preview understands, rendered as
 * a <strong> in the accent colour. Escaping happens per fragment so a literal
 * "<" in the copy can never open a tag.
 */
function md(text: string | undefined, accent: string): string {
  return (text ?? "")
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) => {
      const hit = /^\*\*([^*]+)\*\*$/.exec(part);
      return hit
        ? `<strong style="color:${accent};font-weight:700;">${esc(hit[1])}</strong>`
        : esc(part);
    })
    .join("");
}

/** Paragraph text keeps the line breaks the author typed. */
function mdMultiline(text: string | undefined, accent: string): string {
  return md(text, accent).split("\n").join("<br />");
}

const HEX = /^#[0-9a-fA-F]{6}$/;

type Palette = {
  accent: string;
  bg: string;
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
        bg: "#060a16",
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
        bg: "#e9edf2",
        panel: "#ffffff",
        text: "#0f172a",
        muted: "#475569",
        footerBg: "#f7f8fa",
        divider: "#eef1f4",
        chipBg: "#f1f3f7",
        onAccent: "#ffffff",
      };
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * A button that survives Outlook. The VML rectangle carries the fill and the
 * rounded corner for Word's engine; every other client skips the conditional
 * comment and gets the table cell underneath.
 */
function button(label: string, href: string, p: Palette): string {
  if (!label.trim()) return "";
  const text = esc(label);
  const url = esc(href);
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td align="center" style="padding:4px 0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:440px;" arcsize="50%" stroke="f" fillcolor="${p.accent}">
                      <w:anchorlock/>
                      <center style="color:${p.onAccent};font-family:${FONT};font-size:16px;font-weight:bold;">${text}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;">
                      <tr>
                        <td align="center" bgcolor="${p.accent}" style="border-radius:26px;background-color:${p.accent};">
                          <a href="${url}" target="_blank" style="display:block;padding:15px 24px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;letter-spacing:0.5px;text-transform:uppercase;color:${p.onAccent};text-decoration:none;border-radius:26px;">${text}</a>
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>`;
}

function heroBlock(draft: EmailDraft, p: Palette): string {
  if (draft.heroImage) {
    return `
            <tr>
              <td style="padding:0;">
                <img src="${esc(draft.heroImage)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>`;
  }
  // No hero picture: a solid accent-tinted band. Gradients are not portable,
  // so the fallback is a flat colour every client can paint.
  const inner =
    draft.brandMode === "logo" && draft.logo
      ? `<img src="${esc(draft.logo)}" alt="${esc(draft.brand)}" style="display:block;max-height:64px;max-width:60%;border:0;" />`
      : `<span style="font-family:${FONT};font-size:28px;font-weight:800;letter-spacing:-0.5px;color:${p.text};">${esc(draft.brand || "ВАШ БРЕНД")}</span>`;
  return `
            <tr>
              <td align="center" bgcolor="${p.chipBg}" style="padding:44px 24px;background-color:${p.chipBg};">
                ${inner}
              </td>
            </tr>`;
}

function stepsBlock(draft: EmailDraft, p: Palette): string {
  const steps = (draft.steps ?? []).filter((s) => s.trim());
  if (steps.length === 0) return "";
  const rows = steps
    .map(
      (step, i) => `
                  <tr>
                    <td width="32" valign="top" style="padding:0 12px 10px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                        <tr>
                          <td width="24" height="24" align="center" valign="middle" bgcolor="${p.accent}" style="width:24px;height:24px;border-radius:12px;background-color:${p.accent};font-family:${FONT};font-size:12px;font-weight:700;color:${p.onAccent};">${i + 1}</td>
                        </tr>
                      </table>
                    </td>
                    <td valign="top" style="padding:0 0 10px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${p.muted};">${md(step, p.accent)}</td>
                  </tr>`,
    )
    .join("");
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:20px;">
                <tr>
                  <td colspan="2" align="center" style="padding-bottom:14px;font-family:${FONT};font-size:14px;font-weight:800;text-transform:uppercase;color:${p.text};">Чтобы активировать бонус:</td>
                </tr>${rows}
              </table>`;
}

const PAYMENTS = ["VISA", "Mastercard", "Skrill", "NETELLER", "Yandex", "QIWI", "Trustly"];

function paymentsBlock(p: Palette): string {
  const chips = PAYMENTS.map(
    (name) =>
      `<span style="display:inline-block;margin:0 3px 6px 3px;padding:3px 8px;border-radius:4px;background-color:${p.chipBg};font-family:${FONT};font-size:10px;font-weight:600;color:${p.muted};">${esc(name)}</span>`,
  ).join("");
  const stores = ["App Store", "Google Play"]
    .map(
      (name) =>
        `<span style="display:inline-block;margin:0 4px;padding:6px 12px;border:1px solid ${p.divider};border-radius:8px;font-family:${FONT};font-size:11px;font-weight:500;color:${p.muted};">${esc(name)}</span>`,
    )
    .join("");
  return `
            <tr>
              <td align="center" style="padding:20px 24px 24px 24px;border-top:1px solid ${p.divider};">
                <p style="margin:0 0 12px 0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${p.muted};">Download our mobile app</p>
                <div style="margin-bottom:14px;">${stores}</div>
                <div>${chips}</div>
              </td>
            </tr>`;
}

/**
 * The email as a standalone HTML document — the exact bytes the download and
 * the builder's preview both use, so what is on screen is what is sent.
 */
export function buildEmailHtml(draft: EmailDraft): string {
  const p = palette(draft);
  const cta = safeCtaUrl(draft.ctaUrl) || "#";
  const unsubscribe = safeCtaUrl(draft.unsubscribeUrl) || "#";
  const title = draft.heroTitle || "Заголовок акции";
  const body = draft.body || "";

  // Gmail shows the preheader after the subject; the zero-width padding stops
  // it from pulling the first words of the body in after it.
  const preheader = draft.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${p.panel};opacity:0;">${esc(draft.preheader)}${"&#8199;&#65279;&#847; ".repeat(60)}</div>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="ru">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="${draft.dark ? "dark" : "light"}" />
<meta name="supported-color-schemes" content="${draft.dark ? "dark" : "light"}" />
<title>${esc(draft.subject || draft.name || "Письмо")}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style type="text/css">
  /* Progressive only — several clients drop this block entirely, which is why
     every rule that matters is inline on the element itself. */
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; }
  a { color:${p.accent}; }
  @media only screen and (max-width:620px) {
    .dw-shell { width:100% !important; }
    .dw-pad { padding-left:18px !important; padding-right:18px !important; }
    .dw-title { font-size:22px !important; line-height:28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${p.bg};">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${p.bg}" style="background-color:${p.bg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="dw-shell" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:${p.panel};border-radius:16px;overflow:hidden;">
${heroBlock(draft, p)}
        <tr>
          <td class="dw-pad" align="center" style="padding:28px 28px 8px 28px;">
            <h1 class="dw-title" style="margin:0;font-family:${FONT};font-size:26px;line-height:32px;font-weight:800;text-transform:uppercase;color:${p.text};">${md(title, p.accent)}</h1>
${
  draft.heroSubtitle
    ? `            <p style="margin:8px 0 0 0;font-family:${FONT};font-size:14px;line-height:20px;color:${p.muted};">${md(draft.heroSubtitle, p.accent)}</p>`
    : ""
}
          </td>
        </tr>
${
  draft.ctaText
    ? `        <tr>
          <td class="dw-pad" style="padding:16px 28px 4px 28px;">${button(draft.ctaText, cta, p)}
          </td>
        </tr>`
    : ""
}
        <tr>
          <td class="dw-pad" align="center" style="padding:18px 28px 24px 28px;">
${
  body
    ? `            <p style="margin:0;font-family:${FONT};font-size:14px;line-height:22px;color:${p.muted};">${mdMultiline(body, p.accent)}</p>`
    : ""
}
${stepsBlock(draft, p)}
${draft.bonusCtaText ? `            <div style="margin-top:20px;">${button(draft.bonusCtaText, cta, p)}</div>` : ""}
          </td>
        </tr>
${paymentsBlock(p)}
        <tr>
          <td align="center" bgcolor="${p.footerBg}" style="padding:18px 28px;background-color:${p.footerBg};border-top:1px solid ${p.divider};">
            <p style="margin:0;font-family:${FONT};font-size:11px;line-height:17px;color:${p.muted};">${esc(draft.footer)}</p>
            <a href="${esc(unsubscribe)}" target="_blank" style="display:inline-block;margin-top:8px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:${p.accent};text-decoration:underline;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** File name for the download: the draft's name, or the subject, or a default. */
export function emailFileName(draft: EmailDraft): string {
  const base = (draft.name || draft.subject || "email")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "email"}.html`;
}
