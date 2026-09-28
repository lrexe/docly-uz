'use client';
// Язык интерфейса: сохраняется в localStorage, по умолчанию uz (ru — если Telegram-язык русский).
import { useCallback, useEffect, useState } from 'react';

export type Locale = 'ru' | 'uz';
const KEY = 'docly-locale';

export function useLocale(): [Locale, (l: Locale) => void] {
  const [locale, setLocaleState] = useState<Locale>('uz');

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    if (saved === 'ru' || saved === 'uz') return setLocaleState(saved);
    const code = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    if (code === 'ru') setLocaleState('ru');
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);

  return [locale, setLocale];
}
