// app/(twa)/page.tsx
// Главная панель Docly.uz внутри Telegram Mini App.
// Показывает приветствие, переключатель языка и три ключевые категории документов.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Home,
  Briefcase,
  FileWarning,
  ChevronRight,
  FileText,
  Sparkles,
  Globe,
} from 'lucide-react';

// --------------------------------------------------------------------
// Типы
// --------------------------------------------------------------------
type Locale = 'ru' | 'uz';

interface CategoryConfig {
  slug: 'rent' | 'business' | 'claims';
  icon: React.ElementType;
  accent: string; // Tailwind-классы для цветового акцента карточки
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  templatesCount: number;
}

// --------------------------------------------------------------------
// Конфигурация категорий (в реальном проекте — придёт из /api/templates)
// --------------------------------------------------------------------
const CATEGORIES: CategoryConfig[] = [
  {
    slug: 'rent',
    icon: Home,
    accent: 'bg-blue-50 text-blue-600 ring-blue-100',
    title: { ru: 'Аренда', uz: 'Ijara' },
    description: {
      ru: 'Договоры аренды квартир, домов и коммерческой недвижимости',
      uz: 'Kvartira, uy va tijorat ko‘chmas mulkini ijaraga berish shartnomalari',
    },
    templatesCount: 6,
  },
  {
    slug: 'business',
    icon: Briefcase,
    accent: 'bg-violet-50 text-violet-600 ring-violet-100',
    title: { ru: 'Бизнес', uz: 'Biznes' },
    description: {
      ru: 'Учредительные документы, договоры оказания услуг, NDA',
      uz: 'Ta’sis hujjatlari, xizmat ko‘rsatish shartnomalari, NDA',
    },
    templatesCount: 9,
  },
  {
    slug: 'claims',
    icon: FileWarning,
    accent: 'bg-amber-50 text-amber-600 ring-amber-100',
    title: { ru: 'Претензии', uz: 'Da’volar' },
    description: {
      ru: 'Досудебные претензии, жалобы и заявления в госорганы',
      uz: 'Sud oldi da’volari, shikoyatlar va davlat organlariga arizalar',
    },
    templatesCount: 5,
  },
];

const UI_TEXT: Record<Locale, { greeting: string; subtitle: string; recent: string; cta: string }> = {
  ru: {
    greeting: 'Привет',
    subtitle: 'Выберите категорию, чтобы создать документ за пару минут',
    recent: 'Недавние документы',
    cta: 'Создать документ',
  },
  uz: {
    greeting: 'Salom',
    subtitle: 'Bir necha daqiqada hujjat yaratish uchun bo‘limni tanlang',
    recent: 'So‘nggi hujjatlar',
    cta: 'Hujjat yaratish',
  },
};

// --------------------------------------------------------------------
// Компонент
// --------------------------------------------------------------------
export default function HomePage() {
  const [locale, setLocale] = useState<Locale>('ru');
  const [firstName, setFirstName] = useState<string>('');

  // Инициализация данных из Telegram WebApp (initDataUnsafe используется только
  // для UX-персонализации; для безопасности всегда валидируем initData на бэкенде).
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const user = tg.initDataUnsafe?.user;
      if (user?.first_name) setFirstName(user.first_name);
      // Автоопределение языка из Telegram, если пользователь узбекоязычный
      if (user?.language_code === 'uz') setLocale('uz');
    }
  }, []);

  const t = UI_TEXT[locale];

  return (
    <main
      className="
        min-h-screen w-full bg-[var(--tg-theme-bg-color,#f8fafc)]
        pb-[env(safe-area-inset-bottom,0px)]
        pt-[env(safe-area-inset-top,0px)]
      "
    >
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 pb-10 pt-5">
        {/* Шапка */}
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">
              {t.greeting}{firstName ? `, ${firstName}` : ''} 👋
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Sparkles className="h-6 w-6 text-blue-600" />
              Docly.uz
            </h1>
          </div>

          {/* Переключатель языка UZ/RU */}
          <button
            onClick={() => setLocale((prev) => (prev === 'ru' ? 'uz' : 'ru'))}
            className="
              flex items-center gap-1.5 rounded-full border border-slate-200
              bg-white px-3 py-1.5 text-sm font-medium text-slate-700
              shadow-sm transition active:scale-95
            "
            aria-label="Switch language"
          >
            <Globe className="h-4 w-4 text-slate-400" />
            {locale === 'ru' ? 'RU' : 'UZ'}
          </button>
        </header>

        <p className="text-sm leading-relaxed text-slate-500">{t.subtitle}</p>

        {/* Карточки категорий */}
        <section className="flex flex-col gap-3">
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.slug}
                href={`/categories/${category.slug}`}
                className="
                  group flex items-center gap-4 rounded-2xl border border-slate-100
                  bg-white p-4 shadow-sm transition
                  active:scale-[0.98] active:shadow-none
                  hover:border-slate-200 hover:shadow-md
                "
              >
                <div
                  className={`
                    flex h-12 w-12 shrink-0 items-center justify-center
                    rounded-xl ring-1 ${category.accent}
                  `}
                >
                  <Icon className="h-6 w-6" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-slate-900">
                    {category.title[locale]}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">
                    {category.description[locale]}
                  </p>
                  <span className="mt-1 inline-block text-[11px] font-medium text-slate-400">
                    {category.templatesCount} {locale === 'ru' ? 'шаблонов' : 'shablon'}
                  </span>
                </div>

                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
              </Link>
            );
          })}
        </section>

        {/* Быстрый доступ к истории документов */}
        <section className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">{t.recent}</h3>
            <Link
              href="/documents"
              className="text-xs font-medium text-blue-600 active:opacity-70"
            >
              {locale === 'ru' ? 'Все →' : 'Barchasi →'}
            </Link>
          </div>

          {/* Пустое состояние — в реальном проекте заменить на реальный список
              из GET /api/documents, отрисованный этим же блоком */}
          <div
            className="
              flex flex-col items-center justify-center gap-2 rounded-2xl
              border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center
            "
          >
            <FileText className="h-8 w-8 text-slate-300" />
            <p className="text-xs text-slate-400">
              {locale === 'ru'
                ? 'Здесь появятся ваши сгенерированные документы'
                : 'Bu yerda yaratilgan hujjatlaringiz ko‘rinadi'}
            </p>
          </div>
        </section>
      </div>

      {/* Плавающая кнопка — дублирует Telegram MainButton для веб-версии вне TWA */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-100 bg-white/90 px-4 py-3 backdrop-blur pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <div className="mx-auto max-w-md">
          <Link
            href="/categories/rent"
            className="
              flex w-full items-center justify-center gap-2 rounded-xl
              bg-blue-600 py-3 text-sm font-semibold text-white
              shadow-sm transition active:scale-[0.98] active:bg-blue-700
            "
          >
            <FileText className="h-4 w-4" />
            {t.cta}
          </Link>
        </div>
      </div>
    </main>
  );
}