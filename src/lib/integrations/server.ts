// Хранилище ключей клиентов на сервере: user_integrations (миграция 0017),
// секрет — только в зашифрованном виде (crypto.ts). Наружу (в браузер) уходят
// лишь не секретные поля и маска; расшифровывать секрет может только серверный
// код, которому он нужен для вызова площадки (getIntegrationSecret).
import type { SupabaseClient } from "@supabase/supabase-js";

import { aadFor, decryptSecret, encryptSecret } from "./crypto";
import type { IntegrationInput, IntegrationProvider, IntegrationPublic, IntegrationView } from "./types";

type Row = { provider: IntegrationProvider; secret: string; public: IntegrationPublic; updated_at: string };
type Secret = { value: string };

export class IntegrationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function listIntegrations(supa: SupabaseClient, userId: string): Promise<{ data: IntegrationView[]; error: unknown }> {
  const { data, error } = await supa
    .from("user_integrations")
    .select("provider,public,updated_at")
    .eq("user_id", userId);
  return {
    error,
    data: ((data ?? []) as Row[]).map((r) => ({ provider: r.provider, public: r.public ?? {}, updatedAt: r.updated_at })),
  };
}

/**
 * Сохранить подключение. Пустой secret — оставить прежний (поменять только
 * ID кабинета или отправителя); новой записи без секрета не бывает.
 */
export async function saveIntegration(supa: SupabaseClient, userId: string, input: IntegrationInput): Promise<{ error: unknown }> {
  const provider = input.provider;
  const secret = clean(input.secret, 4096);
  const pub: IntegrationPublic =
    provider === "esp"
      ? {
          espProvider: (["sendgrid", "mailgun", "smtp"] as const).find((p) => p === input.espProvider) ?? "",
          sender: clean(input.sender, 200),
        }
      : { accountId: clean(input.accountId, 100) };

  let stored: string | null = null;
  if (secret) {
    stored = encryptSecret({ value: secret } satisfies Secret, aadFor(userId, provider));
    pub.last4 = secret.slice(-4);
  } else {
    const { data, error } = await supa
      .from("user_integrations")
      .select("secret,public")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) return { error };
    if (!data) throw new IntegrationError("Укажите ключ — без него подключение не сохранить");
    stored = (data as Row).secret;
    pub.last4 = (data as Row).public?.last4;
  }

  const { error } = await supa.from("user_integrations").upsert(
    { user_id: userId, provider, secret: stored, public: pub, updated_at: new Date().toISOString() },
    { onConflict: "user_id,provider" },
  );
  return { error };
}

export async function deleteIntegration(supa: SupabaseClient, userId: string, provider: IntegrationProvider) {
  return supa.from("user_integrations").delete().eq("user_id", userId).eq("provider", provider);
}

/**
 * Расшифрованный ключ — только для серверного кода, который вызывает
 * площадку от имени пользователя. Никогда не отдавать в ответ клиенту.
 */
export async function getIntegrationSecret(
  supa: SupabaseClient,
  userId: string,
  provider: IntegrationProvider,
): Promise<{ secret: string; public: IntegrationPublic } | null> {
  const { data } = await supa
    .from("user_integrations")
    .select("secret,public")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  const row = data as Row;
  const { value } = decryptSecret<Secret>(row.secret, aadFor(userId, provider));
  return { secret: value, public: row.public ?? {} };
}
