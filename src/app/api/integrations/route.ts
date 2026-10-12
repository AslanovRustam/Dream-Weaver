// Подключения пользователя к внешним сервисам (рекламные кабинеты, почта).
//
// GET              — список подключений без секретов: ID кабинета, отправитель,
//                    маска ключа «••••abcd».
// PUT { provider, secret?, accountId?, espProvider?, sender? }
//                  — сохранить; пустой secret — оставить прежний ключ.
// DELETE ?provider=meta — отключить.
//
// Секрет шифруется на сервере (AES-256-GCM, ключ INTEGRATIONS_KEK) и обратно
// в браузер не возвращается никогда. Пока миграция 0017 не применена или ключ
// шифрования не задан — 503 integrations_unavailable.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/jobs/server";
import { integrationsKeyReady } from "@/lib/integrations/crypto";
import { IntegrationError, deleteIntegration, listIntegrations, saveIntegration } from "@/lib/integrations/server";
import { INTEGRATION_PROVIDERS, type IntegrationInput, type IntegrationProvider } from "@/lib/integrations/types";

export const runtime = "nodejs";

const unavailable = (why: "table" | "key") =>
  Response.json(
    {
      error: "integrations_unavailable",
      detail: why === "table" ? "Не применена миграция 0017_user_integrations" : "На сервере не задан INTEGRATIONS_KEK",
    },
    { status: 503 },
  );

const isProvider = (v: unknown): v is IntegrationProvider => INTEGRATION_PROVIDERS.includes(v as IntegrationProvider);

async function auth(request: Request, bucket: string, limit: number) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return { error: authErrorResponse(err) };
  }
  const rl = await rateLimitResponse(bucket, user.id, limit, 60_000);
  if (rl) return { error: rl };
  if (!integrationsKeyReady()) return { error: unavailable("key") };
  return { user };
}

export async function GET(request: Request) {
  const a = await auth(request, "integrations-read", 60);
  if ("error" in a) return a.error;
  const { data, error } = await listIntegrations(getAdminClient(), a.user.id);
  if (isMissingTable(error as { code?: string } | null)) return unavailable("table");
  if (error) return Response.json({ error: "Не удалось загрузить подключения" }, { status: 500 });
  return Response.json({ integrations: data });
}

export async function PUT(request: Request) {
  const a = await auth(request, "integrations-write", 20);
  if ("error" in a) return a.error;
  const big = rejectLargeBody(request, 16 * 1024);
  if (big) return big;

  let body: IntegrationInput;
  try {
    body = (await request.json()) as IntegrationInput;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isProvider(body?.provider)) return Response.json({ error: "Неизвестный сервис" }, { status: 400 });

  try {
    const { error } = await saveIntegration(getAdminClient(), a.user.id, body);
    if (isMissingTable(error as { code?: string } | null)) return unavailable("table");
    if (error) return Response.json({ error: "Не удалось сохранить подключение" }, { status: 500 });
  } catch (e) {
    if (e instanceof IntegrationError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { data } = await listIntegrations(getAdminClient(), a.user.id);
  return Response.json({ integrations: data });
}

export async function DELETE(request: Request) {
  const a = await auth(request, "integrations-write", 20);
  if ("error" in a) return a.error;
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isProvider(provider)) return Response.json({ error: "Неизвестный сервис" }, { status: 400 });
  const { error } = await deleteIntegration(getAdminClient(), a.user.id, provider);
  if (isMissingTable(error)) return unavailable("table");
  if (error) return Response.json({ error: "Не удалось отключить" }, { status: 500 });
  return Response.json({ ok: true });
}
