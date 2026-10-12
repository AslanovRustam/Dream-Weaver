// Шифрование ключей клиентов (только сервер).
//
// AES-256-GCM: шифр с проверкой целостности — подменённый или испорченный
// шифротекст не расшифруется, а не превратится в мусорный токен. Ключ — 32
// байта в base64 в INTEGRATIONS_KEK (сгенерировать: openssl rand -base64 32).
// Формат записи: «v1:<base64(iv[12] | tag[16] | ciphertext)>»; v1 — чтобы
// когда-нибудь сменить схему или ключ, не теряя старые записи.
//
// Привязка к владельцу: user_id и провайдер идут как AAD — шифротекст одного
// пользователя нельзя переложить в строку другого (не расшифруется).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export class IntegrationsKeyMissing extends Error {
  constructor() {
    super("INTEGRATIONS_KEK не задан или не 32 байта в base64");
  }
}

function kek(raw = process.env.INTEGRATIONS_KEK): Buffer {
  const key = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new IntegrationsKeyMissing();
  return key;
}

/** Есть ли ключ шифрования — без него хранилище выключено. */
export function integrationsKeyReady(raw = process.env.INTEGRATIONS_KEK): boolean {
  try {
    kek(raw);
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(value: unknown, aad: string, raw?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kek(raw), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
}

export function decryptSecret<T = unknown>(stored: string, aad: string, raw?: string): T {
  const [version, body] = stored.split(":", 2);
  if (version !== VERSION || !body) throw new Error("Неизвестный формат секрета");
  const buf = Buffer.from(body, "base64");
  if (buf.length < 12 + 16 + 1) throw new Error("Повреждённый секрет");
  const decipher = createDecipheriv("aes-256-gcm", kek(raw), buf.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(buf.subarray(12, 28));
  const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as T;
}

/** AAD записи: секрет привязан к владельцу и провайдеру. */
export const aadFor = (userId: string, provider: string) => `${userId}:${provider}`;
