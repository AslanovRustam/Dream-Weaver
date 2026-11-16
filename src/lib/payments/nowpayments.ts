// NOWPayments — приём крипты (USDT, BTC, ETH… на выбор плательщика). Только сервер.
//
// Env:
//   NOWPAYMENTS_API_KEY     — ключ API (кабинет → Settings → Payments → API keys)
//   NOWPAYMENTS_IPN_SECRET  — IPN secret (там же), им подписаны webhook-и
//   NOWPAYMENTS_SANDBOX=1   — тестовый контур api-sandbox.nowpayments.io
//
// Поток: createInvoice → человек платит на странице NOWPayments → провайдер шлёт
// IPN (POST на /api/payments/webhook/nowpayments) с заголовком x-nowpayments-sig =
// HMAC-SHA512(JSON с отсортированными ключами, IPN secret).
import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentStatus } from "./packages";

const base = () =>
  process.env.NOWPAYMENTS_SANDBOX === "1" ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1";

export function nowpaymentsConfigured(): boolean {
  return Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET);
}

export async function createInvoice(o: {
  orderId: string;
  priceUsd: number;
  description: string;
  ipnUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const res = await fetch(`${base()}/invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.NOWPAYMENTS_API_KEY ?? "" },
    body: JSON.stringify({
      price_amount: o.priceUsd,
      price_currency: "usd",
      order_id: o.orderId,
      order_description: o.description,
      ipn_callback_url: o.ipnUrl,
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string | number; invoice_url?: string; message?: string };
  if (!res.ok || !data.id || !data.invoice_url) throw new Error(data.message || `NOWPayments ${res.status}`);
  return { id: String(data.id), url: data.invoice_url };
}

/** Ключи объекта по алфавиту, рекурсивно — так NOWPayments считает подпись. */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}

export function verifyIpn(body: unknown, signature: string | null): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret).update(JSON.stringify(sortKeys(body))).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Ipn = {
  payment_id?: number | string;
  invoice_id?: number | string;
  payment_status?: string;
  order_id?: string;
  price_amount?: number | string;
  price_currency?: string;
  pay_currency?: string;
  actually_paid?: number | string;
};

/** Статус провайдера → наш. Кредиты начисляются только на finished. */
export function mapStatus(s: string | undefined): PaymentStatus {
  switch (s) {
    case "finished":
      return "paid";
    case "partially_paid":
      return "partially_paid";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "refunded":
      return "refunded";
    default:
      return "pending"; // waiting, confirming, confirmed, sending
  }
}
