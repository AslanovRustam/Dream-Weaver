// Проверка хранилища ключей клиентов: шифрование и логика сохранения.
//
//   npx tsx scripts/integrations-check.mts
//
// Без базы: таблица user_integrations подменена простой памятью с тем же
// интерфейсом, что нужен server.ts (select/eq/maybeSingle, upsert, delete).

import { randomBytes } from "node:crypto";

import { aadFor, decryptSecret, encryptSecret, integrationsKeyReady } from "../src/lib/integrations/crypto";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}${extra ? " — " + extra : ""}`);
  }
};
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

const KEK = randomBytes(32).toString("base64");
const OTHER = randomBytes(32).toString("base64");
process.env.INTEGRATIONS_KEK = KEK;

// ---- шифрование
const aad = aadFor("user-1", "meta");
const enc = encryptSecret({ value: "EAAB-secret-token-1234" }, aad);
check("формат v1", enc.startsWith("v1:"));
check("в шифротексте нет токена", !enc.includes("secret-token"));
check("туда-обратно", decryptSecret<{ value: string }>(enc, aad).value === "EAAB-secret-token-1234");
check("одно и то же шифруется по-разному (случайный IV)", encryptSecret({ value: "x" }, aad) !== encryptSecret({ value: "x" }, aad));
check("чужой пользователь не расшифрует", throws(() => decryptSecret(enc, aadFor("user-2", "meta"))));
check("другой провайдер не расшифрует", throws(() => decryptSecret(enc, aadFor("user-1", "google"))));
check("другой ключ не расшифрует", throws(() => decryptSecret(enc, aad, OTHER)));
const body = Buffer.from(enc.slice(3), "base64");
body[body.length - 1] ^= 1;
check("подменённый шифротекст не расшифруется", throws(() => decryptSecret(`v1:${body.toString("base64")}`, aad)));
check("неизвестная версия", throws(() => decryptSecret(enc.replace("v1:", "v2:"), aad)));
check("ключ готов", integrationsKeyReady(KEK));
check("без ключа — выключено", !integrationsKeyReady("") && !integrationsKeyReady(randomBytes(16).toString("base64")));
check("шифровать без ключа нельзя", throws(() => encryptSecret({ value: "x" }, aad, "")));

// ---- сохранение (server.ts) на поддельной таблице
const { saveIntegration, listIntegrations, deleteIntegration, getIntegrationSecret, IntegrationError } = await import(
  "../src/lib/integrations/server"
);
type Row = Record<string, unknown>;
const table: Row[] = [];
function fake() {
  const q = (filters: [string, unknown][] = []) => {
    const rows = () => table.filter((r) => filters.every(([k, v]) => r[k] === v));
    const api = {
      select: () => api,
      eq: (k: string, v: unknown) => q([...filters, [k, v]]),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows(), error: null }),
      delete: () => ({
        eq: (k: string, v: unknown) => ({
          eq: async (k2: string, v2: unknown) => {
            for (let i = table.length - 1; i >= 0; i--) if (table[i][k] === v && table[i][k2] === v2) table.splice(i, 1);
            return { error: null };
          },
        }),
      }),
      upsert: async (row: Row) => {
        const i = table.findIndex((r) => r.user_id === row.user_id && r.provider === row.provider);
        if (i >= 0) table[i] = row;
        else table.push(row);
        return { error: null };
      },
    };
    return api;
  };
  return { from: () => q() } as never;
}
const supa = fake();

await saveIntegration(supa, "u1", { provider: "meta", secret: "EAAB-token-ABCD", accountId: "act_1" });
let list = (await listIntegrations(supa, "u1")).data;
check("подключение видно", list.length === 1 && list[0].public.accountId === "act_1");
check("маска — последние 4", list[0].public.last4 === "ABCD");
check("в списке нет секрета", !JSON.stringify(list).includes("EAAB-token"));
check("в таблице секрет зашифрован", String(table[0].secret).startsWith("v1:") && !String(table[0].secret).includes("EAAB"));

await saveIntegration(supa, "u1", { provider: "meta", secret: "", accountId: "act_2" });
const s1 = await getIntegrationSecret(supa, "u1", "meta");
check("пустой ключ — прежний сохраняется", s1?.secret === "EAAB-token-ABCD" && s1.public.accountId === "act_2");
check("маска сохраняется", s1?.public.last4 === "ABCD");

let refused = false;
try {
  await saveIntegration(supa, "u1", { provider: "google", secret: "", accountId: "123" });
} catch (e) {
  refused = e instanceof IntegrationError;
}
check("новое подключение без ключа — отказ", refused);

await saveIntegration(supa, "u1", { provider: "esp", secret: "SG.key-9999", espProvider: "sendgrid", sender: "a@b.c" });
const esp = await getIntegrationSecret(supa, "u1", "esp");
check("ESP: ключ, провайдер, отправитель", esp?.secret === "SG.key-9999" && esp.public.espProvider === "sendgrid" && esp.public.sender === "a@b.c");
await saveIntegration(supa, "u1", { provider: "esp", secret: "x", espProvider: "evil" as never });
check("ESP: неизвестный провайдер не сохраняется", (await getIntegrationSecret(supa, "u1", "esp"))?.public.espProvider === "");

check("чужой пользователь не видит", (await listIntegrations(supa, "u2")).data.length === 0);
check("чужой пользователь не достанет секрет", (await getIntegrationSecret(supa, "u2", "meta")) === null);

await deleteIntegration(supa, "u1", "meta");
list = (await listIntegrations(supa, "u1")).data;
check("отключение удаляет запись", !list.some((i) => i.provider === "meta"));

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
