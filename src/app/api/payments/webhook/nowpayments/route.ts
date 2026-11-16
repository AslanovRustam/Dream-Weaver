// POST /api/payments/webhook/nowpayments — IPN от NOWPayments.
// Без входа пользователя: доверие — только подпись x-nowpayments-sig.
// Кредиты начисляются на finished, если оплаченная сумма = цена пакета;
// повторы IPN безопасны (credit_payment начисляет один раз).
import { mapStatus, verifyIpn, type Ipn } from "@/lib/payments/nowpayments";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 64_000) return new Response("too large", { status: 413 });
  let ipn: Ipn;
  try {
    ipn = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!verifyIpn(ipn, request.headers.get("x-nowpayments-sig"))) {
    console.warn("[payments] IPN with bad signature");
    return new Response("bad signature", { status: 401 });
  }
  const orderId = String(ipn.order_id ?? "");
  if (!UUID.test(orderId)) return new Response("ok", { status: 200 }); // не наш заказ

  const supa = getAdminClient();
  const { data: pay } = await supa
    .from("payments")
    .select("id, provider, amount_usd, status, credited_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!pay || pay.provider !== "nowpayments") return new Response("ok", { status: 200 });

  const status = mapStatus(ipn.payment_status);
  const paymentId = ipn.payment_id != null ? String(ipn.payment_id) : null;
  const meta = { provider_status: ipn.payment_status, pay_currency: ipn.pay_currency, actually_paid: ipn.actually_paid };

  if (status === "paid") {
    // Счёт выставлен в USD на цену пакета — подпись верна, но сумму всё равно сверяем.
    const sameAmount =
      String(ipn.price_currency ?? "").toLowerCase() === "usd" && Math.abs(Number(ipn.price_amount) - Number(pay.amount_usd)) < 0.01;
    if (!sameAmount) {
      console.error("[payments] amount mismatch", { orderId, ipn: ipn.price_amount, expected: pay.amount_usd });
      await supa.from("payments").update({ provider_status: "amount_mismatch", meta, updated_at: new Date().toISOString() }).eq("id", pay.id);
      return new Response("ok", { status: 200 });
    }
    const { error } = await supa.rpc("credit_payment", { p_payment_id: pay.id, p_provider_payment_id: paymentId, p_meta: meta });
    if (error) {
      console.error("[payments] credit_payment failed", error);
      return new Response("retry", { status: 500 }); // провайдер повторит IPN
    }
    await supa
      .from("payments")
      .update({ provider_status: ipn.payment_status, pay_currency: ipn.pay_currency ?? null, meta })
      .eq("id", pay.id);
    return new Response("ok", { status: 200 });
  }

  // Промежуточные статусы. Начисленный платёж назад не откатываем (кроме возврата — его видно отдельно).
  if (!pay.credited_at || status === "refunded") {
    await supa
      .from("payments")
      .update({
        status: pay.credited_at && status !== "refunded" ? pay.status : status,
        provider_status: ipn.payment_status ?? null,
        provider_payment_id: paymentId,
        pay_currency: ipn.pay_currency ?? null,
        meta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pay.id);
  }
  return new Response("ok", { status: 200 });
}
