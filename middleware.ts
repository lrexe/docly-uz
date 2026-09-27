// middleware.ts (в корне проекта, на одном уровне с /app)
// Централизованная валидация Telegram initData для всех защищённых API-роутов.
// Идея: HMAC-проверка делается ОДИН раз здесь, а не дублируется в каждом route.ts.
//
// ВАЖНО: middleware исполняется в Edge Runtime, поэтому используется
// validateTelegramInitDataEdge (Web Crypto), а не Node-версия с `crypto`.

import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitDataEdge } from '@/lib/telegram/validateInitDataEdge';

// Матчер сам по себе исключает публичные роуты: /api/templates/* (публичный каталог)
// и /api/payments/* (вебхуки Payme/Click — у них своя авторизация: Basic Auth и MD5-подпись,
// они НЕ используют Telegram initData вовсе, поэтому даже не должны попадать в этот middleware).
export const config = {
  matcher: ['/api/generate/:path*', '/api/documents/:path*', '/api/auth/:path*'],
};

/**
 * Извлекает initData из запроса.
 * Приоритет — официальная схема Telegram `Authorization: tma <initData>`,
 * фолбэк — `X-Telegram-Init-Data` (для обратной совместимости с ранними route).
 */
function extractInitData(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('tma ')) {
    return authHeader.slice(4).trim();
  }
  return req.headers.get('x-telegram-init-data');
}

export async function middleware(req: NextRequest) {
  const initData = extractInitData(req);
  if (!initData) {
    return NextResponse.json({ error: 'MISSING_INIT_DATA' }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[middleware] TELEGRAM_BOT_TOKEN не задан');
    return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
  }

  const result = await validateTelegramInitDataEdge(initData, botToken);
  if (!result.valid || !result.user) {
    return NextResponse.json({ error: 'INVALID_TELEGRAM_SIGNATURE', reason: result.reason }, { status: 401 });
  }

  // Прокидываем провалидированные данные пользователя дальше в Route Handlers,
  // чтобы они больше не дублировали HMAC-проверку.
  //
  // ВАЖНО ДЛЯ БЕЗОПАСНОСТИ: сначала УДАЛЯЕМ любые одноимённые заголовки, которые мог
  // прислать сам клиент — иначе клиент мог бы просто подделать `x-telegram-user-id`
  // напрямую в запросе к API, минуя проверку подписи. Next.js Route Handlers получат
  // эти заголовки уже только от middleware, поэтому им можно доверять.
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.delete('x-telegram-user-id');
  forwardedHeaders.delete('x-telegram-user');
  forwardedHeaders.set('x-telegram-user-id', String(result.user.id));
  // Полный профиль пользователя (JSON) — нужен, например, /api/auth/telegram для upsert
  // (там требуются first_name/username/language_code, а не только числовой id).
  forwardedHeaders.set('x-telegram-user', JSON.stringify(result.user));

  return NextResponse.next({ request: { headers: forwardedHeaders } });
}