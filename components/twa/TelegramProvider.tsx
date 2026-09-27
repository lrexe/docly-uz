// components/twa/TelegramProvider.tsx
// Клиентский провайдер Telegram Mini App. Задачи:
//   1. Вызывает tg.ready() / tg.expand() при монтировании приложения.
//   2. Синхронизирует пользователя с бэкендом через POST /api/auth/telegram
//      (upsert в таблицу users) и кладёт результат в React Context.
//   3. Даёт остальным компонентам доступ к dbUser (баланс, квоты, премиум-статус)
//      без повторных ручных fetch-запросов в каждой странице.
//
// Подключение (app/(twa)/layout.tsx):
//   import { TelegramProvider } from '@/components/twa/TelegramProvider';
//   export default function TwaLayout({ children }: { children: React.ReactNode }) {
//     return <TelegramProvider>{children}</TelegramProvider>;
//   }

'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface TelegramUnsafeUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

/** Пользователь из нашей БД (таблица `users`) — источник правды по балансу/квотам. */
export interface DbUser {
  id: string;
  language: 'ru' | 'uz';
  balance: number;
  free_generations_left: number;
  is_premium: boolean;
}

interface TelegramContextValue {
  /** true после успешного tg.ready() — SDK Telegram доступен и инициализирован. */
  isReady: boolean;
  /** true, пока идёт запрос POST /api/auth/telegram. */
  isAuthenticating: boolean;
  /** Причина, по которой синхронизация с бэкендом не удалась (или прошла не из Telegram). */
  authError: 'NOT_IN_TELEGRAM' | string | null;
  /** Сырые данные пользователя из window.Telegram.WebApp.initDataUnsafe (для мгновенного UX). */
  telegramUser: TelegramUnsafeUser | null;
  /** Авторитетные данные из нашей БД (баланс, квоты) — появляются после ответа бэкенда. */
  dbUser: DbUser | null;
  /** Повторно запускает синхронизацию с бэкендом (например, после пополнения баланса). */
  refreshUser: () => Promise<void>;
}

const TelegramContext = createContext<TelegramContextValue | undefined>(undefined);

/** Хук доступа к контексту Telegram. Бросает ошибку вне <TelegramProvider>, чтобы не молчать о баге. */
export function useTelegram(): TelegramContextValue {
  const ctx = useContext(TelegramContext);
  if (!ctx) {
    throw new Error('useTelegram() должен вызываться внутри <TelegramProvider>');
  }
  return ctx;
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<TelegramUnsafeUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);

  // --------------------------------------------------------------------
  // Синхронизация с бэкендом: POST /api/auth/telegram (upsert в users)
  // --------------------------------------------------------------------
  const syncUser = useCallback(async () => {
    const tg = (window as any)?.Telegram?.WebApp;
    const initData: string = tg?.initData ?? '';

    if (!initData) {
      // Приложение открыто не из Telegram (например, локальная отладка в обычном браузере) —
      // не считаем это фатальной ошибкой, просто работаем без dbUser.
      setAuthError('NOT_IN_TELEGRAM');
      setIsAuthenticating(false);
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { Authorization: `tma ${initData}` },
      });
      const data = await res.json();

      if (!res.ok || !data?.user) {
        throw new Error(data?.error || 'AUTH_FAILED');
      }

      setDbUser(data.user);
    } catch (error: any) {
      setAuthError(error?.message || 'AUTH_FAILED');
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  // --------------------------------------------------------------------
  // Инициализация Telegram WebApp SDK при монтировании приложения
  // --------------------------------------------------------------------
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;

    if (!tg) {
      // SDK недоступен (не Telegram-окружение) — синхронизация сама корректно
      // обработает отсутствие initData и не даст "зависнуть" в состоянии загрузки.
      syncUser();
      return;
    }

    tg.ready();
    tg.expand();
    setIsReady(true);

    if (tg.initDataUnsafe?.user) {
      setTelegramUser(tg.initDataUnsafe.user as TelegramUnsafeUser);
    }

    syncUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TelegramContext.Provider
      value={{ isReady, isAuthenticating, authError, telegramUser, dbUser, refreshUser: syncUser }}
    >
      {children}
    </TelegramContext.Provider>
  );
}