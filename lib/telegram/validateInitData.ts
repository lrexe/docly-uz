// lib/telegram/validateInitDataEdge.ts
// Edge Runtime-совместимая версия валидации Telegram initData.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ: Next.js Middleware по умолчанию исполняется в Edge Runtime,
// где недоступен Node.js модуль `crypto` (createHmac/timingSafeEqual из
// lib/telegram/validateInitData.ts). Здесь используется Web Crypto API (crypto.subtle),
// который есть и в Edge Runtime, и в Node.js 19+ — один и тот же код работает в обоих.
//
// Алгоритм ровно тот же, что и в lib/telegram/validateInitData.ts (см. комментарии там) —
// см. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

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

/** HMAC-SHA256 через Web Crypto API (доступен в Edge Runtime и в Node 19+). */
async function hmacSha256(keyBytes: Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Сравнение двух hex-строк за постоянное время. Node's `timingSafeEqual` недоступен
 * в Edge Runtime, поэтому реализуем через XOR-аккумулятор — время выполнения не зависит
 * от того, на каком символе произошло первое несовпадение.
 */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Асинхронная (Web Crypto — всегда Promise) валидация initData.
 * Используется в middleware.ts. Для валидации внутри обычных Route Handlers
 * можно продолжать использовать синхронную lib/telegram/validateInitData.ts.
 */
export async function validateTelegramInitDataEdge(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = MAX_AUTH_AGE_SECONDS
): Promise<ValidateInitDataResult> {
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

  const dataCheckEntries: string[] = [];
  params.forEach((value, key) => {
    if (key === 'hash') return;
    dataCheckEntries.push(`${key}=${value}`);
  });
  dataCheckEntries.sort();
  const dataCheckString = dataCheckEntries.join('\n');

  const secretKeyBuffer = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const calculatedHashBuffer = await hmacSha256(new Uint8Array(secretKeyBuffer), dataCheckString);
  const calculatedHash = bufferToHex(calculatedHashBuffer);

  if (!constantTimeEqualHex(calculatedHash, receivedHash)) {
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