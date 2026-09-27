export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

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

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function validateTelegramInitDataEdge(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = MAX_AUTH_AGE_SECONDS
) {
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
      user = parsed;
    } catch {
      return { valid: false, reason: 'MALFORMED_USER', authDate };
    }
  }

  return { valid: true, user, authDate };
}