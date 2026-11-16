// Пакеты кредитов — разовая покупка. Цена и кредиты берутся ТОЛЬКО отсюда, на сервере:
// клиент присылает лишь id пакета, а webhook сверяет оплаченную сумму с этой таблицей.
// Чтобы поменять цены — правка здесь (старые платежи хранят свою цену и кредиты).

export type CreditPackage = {
  id: string;
  name: string;
  credits: number;
  priceUsd: number;
  popular?: boolean;
};

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "pack_300", name: "Старт", credits: 300, priceUsd: 15 },
  { id: "pack_1000", name: "Базовый", credits: 1000, priceUsd: 50 },
  { id: "pack_3000", name: "Про", credits: 3000, priceUsd: 125, popular: true },
  { id: "pack_8000", name: "Студия", credits: 8000, priceUsd: 250 },
  { id: "pack_20000", name: "Агентство", credits: 20000, priceUsd: 600 },
];

export const PACKAGE_BY_ID = new Map(CREDIT_PACKAGES.map((p) => [p.id, p]));

/** Статусы платежа для интерфейса. */
export type PaymentStatus = "created" | "pending" | "partially_paid" | "paid" | "failed" | "expired" | "refunded";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  created: "Счёт создан",
  pending: "Ждём подтверждения сети",
  partially_paid: "Оплачено не полностью",
  paid: "Оплачено, кредиты начислены",
  failed: "Ошибка оплаты",
  expired: "Счёт истёк",
  refunded: "Возврат",
};

