// GET /api/payments — мои платежи (последние 30) + подключена ли оплата криптой.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { nowpaymentsConfigured } from "@/lib/payments/nowpayments";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const { data, error } = await getAdminClient()
    .from("payments")
    .select("id, package_id, credits, amount_usd, status, pay_currency, invoice_url, created_at, credited_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  // Таблицы ещё нет (миграция не применена) — пустая история, а не ошибка страницы.
  return Response.json({ crypto: nowpaymentsConfigured(), items: error ? [] : (data ?? []) });
}
