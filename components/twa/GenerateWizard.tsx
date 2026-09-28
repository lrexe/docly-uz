// components/twa/GenerateWizard.tsx
// Динамическая форма по template.form_schema → POST /api/generate → переход на review.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, ChevronLeft, Sparkles } from 'lucide-react';
import { useTelegram } from '@/components/twa/TelegramProvider';
import type { TemplateField } from '@/lib/llm/prompts/documentGeneration';

type Locale = 'ru' | 'uz';

export interface WizardTemplate {
  id: string;
  category: string;
  title_ru: string;
  title_uz: string;
  form_schema: TemplateField[];
}

const T: Record<Locale, Record<string, string>> = {
  ru: {
    back: 'Назад',
    submit: 'Создать документ',
    generating: 'Генерируем документ…',
    required: 'Заполните обязательные поля',
    choose: 'Выберите…',
    noBalance: 'Недостаточно средств или бесплатных генераций.',
    topUp: 'Пополнить баланс',
    failed: 'Не удалось создать документ. Попробуйте ещё раз.',
    notInTelegram: 'Откройте приложение через Telegram.',
  },
  uz: {
    back: 'Orqaga',
    submit: 'Hujjat yaratish',
    generating: 'Hujjat yaratilmoqda…',
    required: 'Majburiy maydonlarni to‘ldiring',
    choose: 'Tanlang…',
    noBalance: 'Mablag‘ yoki bepul generatsiyalar yetarli emas.',
    topUp: 'Balansni to‘ldirish',
    failed: 'Hujjatni yaratib bo‘lmadi. Qayta urinib ko‘ring.',
    notInTelegram: 'Ilovani Telegram orqali oching.',
  },
};

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500';

export default function GenerateWizard({ template }: { template: WizardTemplate }) {
  const router = useRouter();
  const { dbUser } = useTelegram();
  const [locale, setLocale] = useState<Locale>(dbUser?.language ?? 'ru');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'required' | 'noBalance' | 'failed' | 'notInTelegram' | null>(null);
  const t = T[locale];

  const fields = template.form_schema ?? [];

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const missing = fields.some((f) => f.required && !(values[f.key] ?? '').trim());
    if (missing) return setError('required');

    const initData: string = (window as any)?.Telegram?.WebApp?.initData ?? '';
    if (!initData) return setError('notInTelegram');

    setError(null);
    setBusy(true);
    try {
      const inputData: Record<string, string | number | null> = {};
      for (const f of fields) {
        const raw = (values[f.key] ?? '').trim();
        inputData[f.key] = raw === '' ? null : f.type === 'number' ? Number(raw) : raw;
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
        body: JSON.stringify({ templateId: template.id, inputData, language: locale }),
      });
      const data = await res.json();

      if (res.status === 402) return setError('noBalance');
      if (!res.ok || !data?.documentId) throw new Error(data?.error || 'failed');

      router.push(`/generate/${template.id}/review?documentId=${data.documentId}`);
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--tg-theme-bg-color,#f8fafc)] pb-32">
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-5">
        <header className="flex items-center justify-between">
          <Link href={`/categories/${template.category}`} className="flex items-center gap-1 text-sm text-slate-500">
            <ChevronLeft className="h-4 w-4" />
            {t.back}
          </Link>
          <button
            onClick={() => setLocale((l) => (l === 'ru' ? 'uz' : 'ru'))}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
          >
            {locale.toUpperCase()}
          </button>
        </header>

        <h1 className="text-xl font-bold text-slate-900">{locale === 'ru' ? template.title_ru : template.title_uz}</h1>

        <div className="flex flex-col gap-4">
          {fields.map((field) => {
            const label = locale === 'ru' ? field.label_ru : field.label_uz;
            const value = values[field.key] ?? '';
            return (
              <label key={field.key} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">
                  {label}
                  {field.required && <span className="text-red-500"> *</span>}
                </span>

                {field.type === 'textarea' ? (
                  <textarea rows={3} className={inputCls} value={value} onChange={(e) => setValue(field.key, e.target.value)} />
                ) : field.type === 'select' || field.type === 'radio' ? (
                  <select className={inputCls} value={value} onChange={(e) => setValue(field.key, e.target.value)}>
                    <option value="">{t.choose}</option>
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {locale === 'ru' ? o.label_ru : o.label_uz}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inputCls}
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    inputMode={field.type === 'number' ? 'numeric' : undefined}
                    value={value}
                    onChange={(e) => setValue(field.key, e.target.value)}
                  />
                )}
              </label>
            );
          })}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {error === 'required' && t.required}
              {error === 'failed' && t.failed}
              {error === 'notInTelegram' && t.notInTelegram}
              {error === 'noBalance' && (
                <>
                  {t.noBalance}{' '}
                  <Link href="/billing" className="font-semibold underline">
                    {t.topUp}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-100 bg-white/90 px-4 py-3 backdrop-blur pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <div className="mx-auto max-w-md">
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? t.generating : t.submit}
          </button>
        </div>
      </div>
    </main>
  );
}
