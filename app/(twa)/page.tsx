'use client';
// Главная: заголовок, кнопка «Hujjat yaratish», карточки категорий, быстрые ссылки.

import Link from 'next/link';
import { Home, Briefcase, Users, Gavel, FileText, Wallet, ChevronRight } from 'lucide-react';
import AppHeader from '@/components/twa/AppHeader';
import { useTelegram } from '@/components/twa/TelegramProvider';
import { useLocale } from '@/lib/i18n/useLocale';

const CATEGORIES = [
  { slug: 'rent', icon: Home, uz: 'Ijara shartnomalari', ru: 'Аренда' },
  { slug: 'business', icon: Briefcase, uz: 'Biznes hujjatlari', ru: 'Бизнес' },
  { slug: 'labor', icon: Users, uz: 'Mehnat shartnomalari', ru: 'Трудовые договоры', soon: true },
  { slug: 'claims', icon: Gavel, uz: 'Da’vo arizalari', ru: 'Претензии' },
] as const;

const T = {
  uz: { title: 'Yuridik hujjatlar konstruktori', sub: 'Bir necha daqiqada tayyor hujjat', cta: 'Hujjat yaratish', soon: 'Tez orada', docs: 'Mening hujjatlarim', balance: 'Balans', sum: 'so‘m' },
  ru: { title: 'Конструктор юридических документов', sub: 'Готовый документ за пару минут', cta: 'Создать документ', soon: 'Скоро', docs: 'Мои документы', balance: 'Баланс', sum: 'сум' },
};

export default function HomePage() {
  const [locale, setLocale] = useLocale();
  const { dbUser } = useTelegram();
  const t = T[locale];
  const balance = ((dbUser?.balance ?? 0) / 100).toLocaleString('ru-RU');

  return (
    <main className="min-h-screen pb-10">
      <AppHeader locale={locale} onToggle={() => setLocale(locale === 'uz' ? 'ru' : 'uz')} />

      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-8">
        <section className="text-center">
          <h1 className="text-3xl font-extrabold leading-tight text-navy-dark">{t.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{t.sub}</p>
          <a
            href="#categories"
            className="mt-5 inline-block rounded-xl bg-navy px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-navy/20 active:scale-[0.98]"
          >
            {t.cta}
          </a>
        </section>

        <section id="categories" className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const inner = (
              <>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-navy">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="mt-3 text-sm font-bold leading-snug text-navy-dark">{c[locale]}</span>
                {'soon' in c && <span className="mt-1 text-[11px] font-semibold text-slate-400">{t.soon}</span>}
              </>
            );
            const cls = 'flex min-h-[124px] flex-col items-start rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100';
            return 'soon' in c ? (
              <div key={c.slug} className={`${cls} opacity-60`}>{inner}</div>
            ) : (
              <Link key={c.slug} href={`/categories/${c.slug}`} className={`${cls} transition active:scale-[0.97]`}>
                {inner}
              </Link>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <Link href="/documents" className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <FileText className="h-5 w-5 text-navy" />
            <span className="flex-1 text-sm font-semibold text-navy-dark">{t.docs}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </Link>
          <Link href="/billing" className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <Wallet className="h-5 w-5 text-navy" />
            <span className="flex-1 text-sm font-semibold text-navy-dark">{t.balance}</span>
            <span className="text-sm font-bold text-navy">{balance} {t.sum}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </Link>
        </section>
      </div>
    </main>
  );
}
