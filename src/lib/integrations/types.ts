// Типы подключений, общие для клиента и сервера. Здесь — только то, что можно
// показать в браузере: секреты сюда не попадают никогда, вместо них маска.

export type IntegrationProvider = "meta" | "google" | "tiktok" | "esp";
export const INTEGRATION_PROVIDERS: IntegrationProvider[] = ["meta", "google", "tiktok", "esp"];

export type EspProvider = "" | "sendgrid" | "mailgun" | "smtp";

/** Не секретные поля подключения. */
export type IntegrationPublic = {
  /** ID рекламного кабинета (Meta, Google, TikTok). */
  accountId?: string;
  /** Почтовый сервис и адрес отправителя (ESP). */
  espProvider?: EspProvider;
  sender?: string;
  /** Последние 4 символа ключа — для маски «••••abcd». */
  last4?: string;
};

export type IntegrationView = {
  provider: IntegrationProvider;
  public: IntegrationPublic;
  updatedAt: string;
};

/** Что клиент присылает на сохранение. Пустой secret — оставить прежний. */
export type IntegrationInput = {
  provider: IntegrationProvider;
  secret?: string;
  accountId?: string;
  espProvider?: EspProvider;
  sender?: string;
};

export const mask = (last4?: string) => (last4 ? `••••${last4}` : "");
