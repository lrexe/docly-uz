"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTelegram } from "@/components/twa/TelegramProvider";

/**
 * app/(twa)/billing/page.tsx
 * Shows the user's balance and lets them top it up via Payme or Click.
 * Both providers just need a checkout URL built client-side (merchant id / service id
 * are public parameters); the actual crediting happens server-side in
 * app/api/payments/payme/route.ts and app/api/payments/click/route.ts.
 */

const PAYME_MERCHANT_ID = process.env.NEXT_PUBLIC_PAYME_MERCHANT_ID ?? "";
const CLICK_SERVICE_ID = process.env.NEXT_PUBLIC_CLICK_SERVICE_ID ?? "";
const CLICK_MERCHANT_ID = process.env.NEXT_PUBLIC_CLICK_MERCHANT_ID ?? "";
const RETURN_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://t.me/docly_bot/app";

const QUICK_AMOUNTS_UZS = [10_000, 25_000, 50_000, 100_000];

function buildPaymeUrl(userId: string, amountUzs: number) {
  const amountTiyin = Math.round(amountUzs * 100);
  const raw = `m=${PAYME_MERCHANT_ID};ac.user_id=${userId};a=${amountTiyin}`;
  const encoded = typeof window !== "undefined" ? window.btoa(raw) : Buffer.from(raw).toString("base64");
  return `https://checkout.paycom.uz/${encoded}`;
}

function buildClickUrl(userId: string, amountUzs: number) {
  const query = new URLSearchParams({
    service_id: CLICK_SERVICE_ID,
    merchant_id: CLICK_MERCHANT_ID,
    amount: amountUzs.toFixed(2),
    transaction_param: userId, // becomes merchant_trans_id in the Click callback
    return_url: RETURN_URL,
  });
  return `https://my.click.uz/services/pay?${query.toString()}`;
}

export default function BillingPage() {
  const { webApp, user: tgUser } = useTelegram();
  const [supabase] = useState(() => createClient());

  const [userId, setUserId] = useState<string | null>(null);
  const [balanceTiyin, setBalanceTiyin] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAmount, setSelectedAmount] = useState<number>(QUICK_AMOUNTS_UZS[1]);
  const [customAmount, setCustomAmount] = useState("");

  const loadBalance = useCallback(async () => {
    if (!tgUser?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, balance")
      .eq("telegram_id", tgUser.id)
      .maybeSingle();

    if (!error && data) {
      setUserId(data.id);
      setBalanceTiyin(data.balance ?? 0);
    }
    setLoading(false);
  }, [supabase, tgUser?.id]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  // Re-check the balance when the user returns to the TWA after paying.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadBalance();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadBalance]);

  const effectiveAmount = customAmount ? Number(customAmount) : selectedAmount;
  const canPay = Boolean(userId) && effectiveAmount > 0;

  const handlePay = (provider: "payme" | "click") => {
    if (!userId || !canPay) return;
    const url = provider === "payme" ? buildPaymeUrl(userId, effectiveAmount) : buildClickUrl(userId, effectiveAmount);

    if (webApp?.openLink) {
      webApp.openLink(url);
    } else if (typeof window !== "undefined") {
      window.open(url, "_blank");
    }
  };

  return (
    <main className="min-h-screen px-4 pb-8 pt-4" style={{ background: "var(--tg-theme-bg-color, #ffffff)" }}>
      <h1 className="mb-4 text-xl font-semibold" style={{ color: "var(--tg-theme-text-color, #111111)" }}>
        Баланс
      </h1>

      <section className="mb-6 rounded-2xl p-5" style={{ background: "var(--tg-theme-secondary-bg-color, #f7f7f8)" }}>
        <p className="text-sm opacity-80" style={{ color: "var(--tg-theme-hint-color, #999999)" }}>
          Доступно
        </p>
        <p className="mt-1 text-3xl font-bold" style={{ color: "var(--tg-theme-text-color, #111111)" }}>
          {loading ? "…" : `${((balanceTiyin ?? 0) / 100).toLocaleString("ru-RU")} сум`}
        </p>
      </section>

      <h2 className="mb-3 text-sm font-medium opacity-80" style={{ color: "var(--tg-theme-hint-color, #999999)" }}>
        Пополнить счёт
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {QUICK_AMOUNTS_UZS.map((value) => {
          const active = selectedAmount === value && !customAmount;
          return (
            <button
              key={value}
              onClick={() => {
                setSelectedAmount(value);
                setCustomAmount("");
              }}
              className="rounded-xl border py-3 text-sm font-medium"
              style={{
                borderColor: "var(--tg-theme-hint-color, #eeeeee)",
                background: active ? "var(--tg-theme-button-color, #3390ec)" : "var(--tg-theme-secondary-bg-color, #f7f7f8)",
                color: active ? "var(--tg-theme-button-text-color, #ffffff)" : "var(--tg-theme-text-color, #111111)",
              }}
            >
              {value.toLocaleString("ru-RU")} сум
            </button>
          );
        })}
      </div>

      <input
        type="number"
        inputMode="numeric"
        placeholder="Своя сумма, сум"
        value={customAmount}
        onChange={(e) => setCustomAmount(e.target.value)}
        className="mb-6 w-full rounded-xl border px-4 py-3 text-sm outline-none"
        style={{
          borderColor: "var(--tg-theme-hint-color, #eeeeee)",
          background: "var(--tg-theme-bg-color, #ffffff)",
          color: "var(--tg-theme-text-color, #111111)",
        }}
      />

      <div className="flex flex-col gap-3">
        <button
          onClick={() => handlePay("payme")}
          disabled={!canPay}
          className="rounded-xl py-3.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "#00c8ff", color: "#ffffff" }}
        >
          Оплатить через Payme
        </button>
        <button
          onClick={() => handlePay("click")}
          disabled={!canPay}
          className="rounded-xl py-3.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "#0084ff", color: "#ffffff" }}
        >
          Оплатить через Click
        </button>
      </div>

      <p className="mt-4 text-center text-xs opacity-70" style={{ color: "var(--tg-theme-hint-color, #999999)" }}>
        Зачисление происходит автоматически в течение минуты после оплаты
      </p>
    </main>
  );
}