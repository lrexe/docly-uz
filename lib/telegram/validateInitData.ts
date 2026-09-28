// lib/telegram/validateInitData.ts
// Node.js Runtime-версия валидации Telegram initData (использует встроенный модуль `crypto`).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ ОТ validateInitDataEdge.ts: обычные Route Handlers
// (app/api/**/route.ts) по умолчанию исполняются в Node.js Runtime, где доступен
// быстрый нативный `crypto.createHmac` и `crypto.timingSafeEqual`. Только
// middleware.ts (Edge Runtime) не может использовать этот файл — там нужен
// lib/telegram/validateInitDataEdge.ts (Web Crypto API).
//
// Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

import { createHmac, timingSafeEqual } from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidateInitDataResult {
  valid: boolean;
  user?: TelegramUser;
  authDate?: number;
  reason?:
    | 'MISSING_HASH'
    | 'MISSING_AUTH_DATE'
    | 'EXPIRED'
    | 'SIGNATURE_MISMATCH'
    | 'MALFORMED_USER'
    | 'EMPTY_INIT_DATA';
}

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60; // 24 часа

/**
 * Синхронная валидация initData, присланного Telegram Mini App клиентом.
 * Используется во всех обычных Route Handlers (Node.js Runtime).
 * Для middleware.ts (Edge Runtime) — см. validateInitDataEdge.ts.
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = MAX_AUTH_AGE_SECONDS
): ValidateInitDataResult {
  if (!initData || initData.trim() === '') {
    return { valid: false, reason: 'EMPTY_INIT_DATA' };
  }

  const params = new URLSearchParams(initData);

  const receivedHash = params.get('hash');
  if (!receivedHash) return { valid: false, reason: 'MISSING_HASH' };

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) return { valid: false, reason: 'MISSING_AUTH_DATE' };

  const authDate = parseInt(authDateRaw, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Number.isNaN(authDate) || nowSeconds - authDate > maxAgeSeconds) {
    return { valid: false, reason: 'EXPIRED', authDate };
  }

  // Data-check-string: все пары key=value (кроме hash), отсортированные по ключу, через \n.
  const dataCheckEntries: string[] = [];
  params.forEach((value, key) => {
    if (key === 'hash') return;
    dataCheckEntries.push(`${key}=${value}`);
  });
  dataCheckEntries.sort();
  const dataCheckString = dataCheckEntries.join('\n');

  // secret_key = HMAC_SHA256("WebAppData", bot_token) — именно в этом порядке
  // (bot_token — данные, "WebAppData" — ключ), см. документацию Telegram.
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const receivedBuf = Buffer.from(receivedHash, 'hex');
  const calculatedBuf = Buffer.from(calculatedHash, 'hex');

  const signaturesMatch =
    receivedBuf.length === calculatedBuf.length && timingSafeEqual(receivedBuf, calculatedBuf);

  if (!signaturesMatch) {
    return { valid: false, reason: 'SIGNATURE_MISMATCH', authDate };
  }

  const userRaw = params.get('user');
  let user: TelegramUser | undefined;
  if (userRaw) {
    try {
      const parsed = JSON.parse(userRaw);
      if (typeof parsed?.id !== 'number') {
        return { valid: false, reason: 'MALFORMED_USER', authDate };
      }
      user = {
        id: parsed.id,
        first_name: parsed.first_name,
        last_name: parsed.last_name,
        username: parsed.username,
        language_code: parsed.language_code,
        is_premium: parsed.is_premium,
        photo_url: parsed.photo_url,
      };
    } catch {
      return { valid: false, reason: 'MALFORMED_USER', authDate };
    }
  }

  return { valid: true, user, authDate };
}
