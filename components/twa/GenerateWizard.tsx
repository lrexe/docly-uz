// components/twa/GenerateWizard.tsx
// Пошаговый мастер: один вопрос на экран → POST /api/generate → review.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertCircle, Check } from 'lucide-react';
import AppHeader from '@/components/twa/AppHeader';
import { useLocale } from '@/lib/i18n/useLocale';
import type { TemplateField } from '@/lib/llm/prompts/documentGeneration';

export interface WizardTemplate {
  id: string;
  category: string;
  title_ru: string;
  title_uz: string;
  form_schema: TemplateField[];
}

const T = {
  uz: { back: 'Orqaga', next: 'Davom etish', submit: 'Hujjat yaratish', generating: 'Yaratilmoqda…', step: 'Qadam', of: '/', choose: 'Tanlang',
        required: 'Bu maydonni to‘ldiring', noBalance: 'Mablag‘ yoki bepul generatsiyalar yetarli emas.', topUp: 'Balansni to‘ldirish',
        failed: 'Hujjatni yaratib bo‘lmadi. Qayta urinib ko‘ring.', notInTelegram: 'Ilovani Telegram orqali oching.' },
  ru: { back: 'Назад', next: 'Продолжить', submit: 'Создать документ', generating: 'Создаём…', step: 'Шаг', of: 'из', choose: 'Выберите',
        required: 'Заполните это поле', noBalance: 'Недостаточно средств или бесплатных генераций.', topUp: 'Пополнить баланс',
        failed: 'Не удалось создать документ. Попробуйте ещё раз.', notInTelegram: 'Откройте приложение через Telegram.' },
};

type Err = 'required' | 'noBalance' | 'failed' | 'notInTelegram' | null;

export default function GenerateWizard({ template }: { template: WizardTemplate }) {
  const router = useRouter();
  const [locale, setLocale] = useLocale();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Err>(null);
  const t = T[locale];

  const fields = template.form_schema ?? [];
  const total = fields.length;
  const field = fields[step];
  const isLast = step === total - 1;
  const value = field ? values[field.key] ?? '' : '';
  const title = locale === 'ru' ? template.title_ru : template.title_uz;

  function set(v: string) {
    setError(null);
    setValues((p) => ({ ...p, [field.key]: v }));
  }

  function goBack() {
    setError(null);
    if (step > 0) setStep(step - 1);
    else router.push(`/categories/${template.category}`);
  }

  async function submit() {
    const initData: string = (window as any)?.Telegram?.WebApp?.initData ?? '';
    if (!initData) return setError('notInTelegram');
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

  function next() {
    if (busy || !field) return;
    if (field.required && !value.trim()) return setError('required');
    setError(null);
    if (isLast) submit();
    else setStep(step + 1);
  }

  const inputCls =
    'w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-lg text-navy-dark outline-none focus:border-navy';

  return (
    <main className="min-h-screen pb-36">
      <AppHeader locale={locale} onToggle={() => setLocale(locale === 'uz' ? 'ru' : 'uz')} />

      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-100" aria-label={t.back}>
            <ChevronLeft className="h-5 w-5 text-navy" />
          </button>
          <p className="truncate text-sm font-semibold text-navy-dark">{title}</p>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? ((step + 1) / total) * 100 : 0}%` }} />
        </div>

        {!field ? (
          <p className="mt-10 text-center text-slate-500">—</p>
        ) : (
          <>
            <h1 className="mt-8 text-center text-2xl font-extrabold leading-snug text-navy-dark">
              {locale === 'ru' ? field.label_ru : field.label_uz}
              {field.required && <span className="text-red-500"> *</span>}
            </h1>

            <div className="mt-6">
              {field.type === 'select' || field.type === 'radio' ? (
                <div className="grid grid-cols-2 gap-3">
                  {field.options?.map((o) => {
                    const active = value === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() => set(o.value)}
                        className={`relative flex min-h-[112px] items-center justify-center rounded-2xl p-3 text-center text-sm font-bold shadow-sm transition active:scale-[0.97] ${
                          active ? 'bg-accent/25 text-navy-dark ring-2 ring-navy' : 'bg-white text-navy-dark ring-1 ring-slate-100'
                        }`}
                      >
                        {active && <Check className="absolute right-2 top-2 h-4 w-4 text-navy" />}
                        {locale === 'ru' ? o.label_ru : o.label_uz}
                      </button>
                    );
                  })}
                </div>
              ) : field.type === 'textarea' ? (
                <textarea key={field.key} autoFocus rows={5} className={inputCls} placeholder={field.placeholder} value={value} onChange={(e) => set(e.target.value)} />
              ) : (
                <input
                  key={field.key}
                  autoFocus
                  className={inputCls}
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                  inputMode={field.type === 'number' ? 'numeric' : undefined}
                  placeholder={field.placeholder}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && next()}
                />
              )}
            </div>
          </>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {error === 'required' && t.required}
              {error === 'failed' && t.failed}
              {error === 'notInTelegram' && t.notInTelegram}
              {error === 'noBalance' && (
                <>
                  {t.noBalance}{' '}
                  <Link href="/billing" className="font-semibold underline">{t.topUp}</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 rounded-t-3xl bg-white px-4 pt-3 shadow-[0_-8px_24px_rgba(15,27,61,0.08)] pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <div className="mx-auto max-w-md">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-brand-green">
            <span>{t.step} {step + 1} {t.of} {total}</span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${total ? ((step + 1) / total) * 100 : 0}%` }} />
          </div>
          <div className="flex gap-3">
            <button onClick={goBack} className="flex-1 rounded-xl bg-background py-3.5 text-sm font-semibold text-navy-dark active:scale-[0.98]">
              {t.back}
            </button>
            <button
              onClick={next}
              disabled={busy || !field}
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-navy py-3.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t.generating : isLast ? t.submit : t.next}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
