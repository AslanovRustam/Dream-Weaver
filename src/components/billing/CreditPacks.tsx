"use client";

// Пакеты кредитов с оплатой криптой (NOWPayments) и история платежей.
// Кнопка создаёт счёт на сервере и уводит на страницу оплаты провайдера; после
// оплаты провайдер возвращает сюда с ?paid=<id>, а кредиты начисляет webhook —
// поэтому здесь просто ждём, пока платёж станет «paid», и обновляем список.
import { useCallback, useEffect, useState } from "react";
import { Bitcoin, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { apiJson } from "@/lib/api-client";
import { fetchBalance, refreshMe } from "@/components/AppHeader";
import { estimateBannerCredits, RESIZE_CREDITS_PER_FORMAT } from "@/lib/credit-estimate";

const BANNER_CREDITS_HINT = estimateBannerCredits();
const RESIZE_CREDITS_HINT = RESIZE_CREDITS_PER_FORMAT;
import { CREDIT_PACKAGES, PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payments/packages";

type PaymentRow = {
  id: string;
  package_id: string;
  credits: number;
  amount_usd: number;
  status: PaymentStatus;
  pay_currency: string | null;
  invoice_url: string | null;
  created_at: string;
};

const ru = (n: number) => n.toLocaleString("ru-RU");

/** view: «packs» — вкладка «Кредиты» (баланс + пакеты), «history» — вкладка «Платежи». */
export function CreditPacks({ view }: { view: "packs" | "history" }) {
  const [crypto, setCrypto] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiJson<{ crypto: boolean; items: PaymentRow[] }>("/api/payments");
      setCrypto(r.crypto);
      setItems(r.items);
      return r.items;
    } catch {
      setCrypto(false);
      return [];
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    void fetchBalance().then(setBalance);
    const paid = new URLSearchParams(window.location.search).get("paid");
    if (paid) setWaitingFor(paid);
  }, [load]);

  // Вернулись со страницы оплаты: подтверждение сети занимает минуты — опрашиваем.
  useEffect(() => {
    if (!waitingFor) return;
    let n = 0;
    const t = setInterval(async () => {
      const list = await load();
      const p = list.find((x) => x.id === waitingFor);
      if (p?.status === "paid") {
        toast.success(`Оплата прошла: +${ru(Number(p.credits))} кредитов`);
        setWaitingFor(null);
        refreshMe();
        void fetchBalance().then(setBalance);
      } else if (p && ["failed", "expired", "partially_paid"].includes(p.status)) {
        toast.error(PAYMENT_STATUS_LABEL[p.status]);
        setWaitingFor(null);
      } else if (++n > 60) setWaitingFor(null); // ~10 минут, дальше — по обновлению страницы
    }, 10_000);
    return () => clearInterval(t);
  }, [waitingFor, load]);

  const buy = async (packageId: string) => {
    setBusy(packageId);
    try {
      const r = await apiJson<{ url: string }>("/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ packageId }),
      });
      window.location.href = r.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать счёт");
      setBusy(null);
    }
  };

  if (view === "history") return <History items={items} loaded={loaded} />;

  return (
    <section>
      <div className="mb-6 flex flex-col items-center gap-1 text-center">
        {balance !== null ? (
          <div className="mb-3 rounded-2xl border border-border bg-card px-6 py-3">
            <div className="text-xs text-muted-foreground">Ваш баланс</div>
            <div className="text-2xl font-semibold">{ru(Math.floor(balance))} кр.</div>
            <div className="text-xs text-muted-foreground">
              ≈ {ru(Math.floor(balance / BANNER_CREDITS_HINT))} баннеров или {ru(Math.floor(balance / RESIZE_CREDITS_HINT))} ресайзов
            </div>
          </div>
        ) : null}
        <p className="max-w-md text-sm text-muted-foreground">
          Разовая покупка без подписки, кредиты не сгорают. Оплата криптой: USDT, BTC, ETH и другие монеты.
        </p>
      </div>

      {waitingFor ? (
        <div className="mx-auto mb-5 flex max-w-xl items-center gap-2 rounded-xl border border-accent-green/40 bg-accent-green/5 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-green" />
          Ждём подтверждения оплаты в сети — обычно несколько минут. Кредиты начислятся автоматически.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CREDIT_PACKAGES.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-2xl border bg-card p-4 ${p.popular ? "border-accent-green" : "border-border"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{p.name}</span>
              {p.popular ? (
                <span className="rounded-full bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                  Выгодно
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-2xl font-semibold">{ru(p.credits)}</div>
            <div className="text-xs text-muted-foreground">кредитов</div>
            <div className="mt-3 text-lg font-medium">${ru(p.priceUsd)}</div>
            <div className="text-xs text-muted-foreground">${(p.priceUsd / p.credits).toFixed(3)} за кредит</div>
            <button
              type="button"
              disabled={!crypto || busy !== null}
              onClick={() => buy(p.id)}
              className={`mt-4 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                p.popular ? "bg-accent-green text-on-accent" : "border border-border hover:border-foreground/40"
              }`}
            >
              {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bitcoin className="h-4 w-4" />}
              Оплатить криптой
            </button>
          </div>
        ))}
      </div>
      {crypto === false ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Оплата криптой ещё не подключена — пока пополнение через поддержку.
        </p>
      ) : null}

    </section>
  );
}

function History({ items, loaded }: { items: PaymentRow[]; loaded: boolean }) {
  if (!loaded)
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (!items.length)
    return <p className="py-10 text-center text-sm text-muted-foreground">Платежей пока нет.</p>;
  return (
    <section>
        <div className="mx-auto max-w-3xl">
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm">
            {items.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  {ru(Number(x.credits))} кр. · ${ru(Number(x.amount_usd))}
                  {x.pay_currency ? ` · ${x.pay_currency.toUpperCase()}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(x.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className={x.status === "paid" ? "text-accent-green" : "text-muted-foreground"}>
                  {PAYMENT_STATUS_LABEL[x.status] ?? x.status}
                  {x.status === "pending" && x.invoice_url ? (
                    <a href={x.invoice_url} className="ml-2 underline">
                      к оплате
                    </a>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
    </section>
  );
}
