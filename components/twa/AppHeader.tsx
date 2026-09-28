'use client';
// Шапка в стиле макета: тёмно-синий "ярлык" с логотипом слева и переключатель языка справа.
import Link from 'next/link';
import type { Locale } from '@/lib/i18n/useLocale';

export default function AppHeader({ locale, onToggle }: { locale: Locale; onToggle: () => void }) {
  return (
    <header className="flex items-center justify-between bg-white shadow-sm">
      <Link
        href="/"
        className="inline-flex h-12 items-center bg-navy pl-5 pr-10 text-lg font-bold text-white [clip-path:polygon(0_0,100%_0,84%_100%,0_100%)]"
      >
        Docly.uz
      </Link>
      <button
        onClick={onToggle}
        className="mr-4 rounded-full bg-background px-3 py-1.5 text-xs font-bold text-navy active:scale-95"
        aria-label="Language"
      >
        {locale === 'uz' ? 'UZ · ru' : 'RU · uz'}
      </button>
    </header>
  );
}
