'use client';
// Список шаблонов выбранной категории.
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import AppHeader from '@/components/twa/AppHeader';
import { useLocale } from '@/lib/i18n/useLocale';

export interface TemplateRow {
  id: string;
  title_ru: string;
  title_uz: string;
  description_ru: string | null;
  description_uz: string | null;
  price_tiyin: number;
}

const CATEGORY_TITLE = {
  rent: { uz: 'Ijara shartnomalari', ru: 'Аренда' },
  business: { uz: 'Biznes hujjatlari', ru: 'Бизнес' },
  claims: { uz: 'Da’vo arizalari', ru: 'Претензии' },
} as const;

const T = {
  uz: { back: 'Orqaga', empty: 'Bu bo‘limda hozircha shablonlar yo‘q.', free: 'Bepul', sum: 'so‘m' },
  ru: { back: 'Назад', empty: 'В этой категории пока нет шаблонов.', free: 'Бесплатно', sum: 'сум' },
};

export default function TemplateList({ category, templates }: { category: keyof typeof CATEGORY_TITLE; templates: TemplateRow[] }) {
  const [locale, setLocale] = useLocale();
  const t = T[locale];

  return (
    <main className="min-h-screen pb-10">
      <AppHeader locale={locale} onToggle={() => setLocale(locale === 'uz' ? 'ru' : 'uz')} />
      <div className="mx-auto max-w-md px-4 pt-5">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500">
          <ChevronLeft className="h-4 w-4" />
          {t.back}
        </Link>
        <h1 className="mt-3 text-2xl font-extrabold text-navy-dark">{CATEGORY_TITLE[category][locale]}</h1>

        {templates.length === 0 && <p className="mt-6 text-sm text-slate-500">{t.empty}</p>}

        <div className="mt-5 flex flex-col gap-3">
          {templates.map((tpl) => {
            const desc = locale === 'ru' ? tpl.description_ru : tpl.description_uz;
            return (
              <Link
                key={tpl.id}
                href={`/generate/${tpl.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition active:scale-[0.98]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-navy">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-navy-dark">{locale === 'ru' ? tpl.title_ru : tpl.title_uz}</span>
                  {desc && <span className="mt-0.5 block line-clamp-2 text-xs text-slate-500">{desc}</span>}
                </span>
                <span className="shrink-0 text-xs font-bold text-navy">
                  {tpl.price_tiyin > 0 ? `${(tpl.price_tiyin / 100).toLocaleString('ru-RU')} ${t.sum}` : t.free}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
