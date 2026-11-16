// POST /api/payments/checkout  { packageId } → { url }
// Создаёт строку платежа и счёт у провайдера; человек уходит платить по url.
// Цена и кредиты — только из серверной таблицы пакетов, клиент шлёт лишь id.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { createInvoice, nowpaymentsConfigured } from "@/lib/payments/nowpayments";
import { PACKAGE_BY_ID } from "@/lib/payments/packages";
import { rateLimitResponse } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Публичный адрес приложения: за прокси request.url — внутренний. */
function appOrigin(request: Request): string {
  const env = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("payments-checkout", user.id, 10, 60_000);
  if (rl) return rl;
  if (!nowpaymentsConfigured()) return Response.json({ error: "Оплата криптой ещё не подключена" }, { status: 503 });

  let body: { packageId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pack = PACKAGE_BY_ID.get(String(body.packageId ?? ""));
  if (!pack) return Response.json({ error: "Неизвестный пакет" }, { status: 400 });

  const supa = getAdminClient();
  const { data: row, error } = await supa
    .from("payments")
    .insert({ user_id: user.id, provider: "nowpayments", package_id: pack.id, credits: pack.credits, amount_usd: pack.priceUsd })
    .select("id")
    .single();
  if (error || !row) {
    console.error("[payments] insert failed", error);
    return Response.json({ error: "Не удалось создать платёж" }, { status: 500 });
  }

  const origin = appOrigin(request);
  try {
    const inv = await createInvoice({
      orderId: row.id,
      priceUsd: pack.priceUsd,
      description: `GenGO — ${pack.credits} кредитов`,
      ipnUrl: `${origin}/api/payments/webhook/nowpayments`,
      successUrl: `${origin}/billing?tab=credits&paid=${row.id}`,
      cancelUrl: `${origin}/billing?tab=credits`,
    });
    await supa
      .from("payments")
      .update({ provider_invoice_id: inv.id, invoice_url: inv.url, status: "pending", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return Response.json({ url: inv.url, paymentId: row.id });
  } catch (e) {
    console.error("[payments] invoice failed", e);
    await supa.from("payments").update({ status: "failed", provider_status: "invoice_error" }).eq("id", row.id);
    return Response.json({ error: "Платёжный сервис недоступен, попробуйте позже" }, { status: 502 });
  }
}
