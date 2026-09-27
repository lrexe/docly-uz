// app/api/auth/telegram/route.ts
// POST /api/auth/telegram
// Вызывается один раз при старте Mini App (см. components/twa/TelegramProvider.tsx).
// Валидирует initData и делает upsert пользователя в таблицу `users`:
//   - Новый пользователь → создаётся с дефолтами (free_generations_left: 1, balance: 0).
//   - Существующий → обновляются только изменяемые профильные поля (имя, username, язык),
//     баланс/квоты/премиум-статус НЕ трогаем — иначе повторный вход "сбрасывал" бы прогресс.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateTelegramInitData } from '@/lib/telegram/validateInitData';

/** Код ошибки Postgres при нарушении unique-constraint (используется для race-condition ниже). */
const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Извлекает initData из запроса: приоритет — официальная схема Telegram
 * `Authorization: tma <initData>`, фолбэк — `X-Telegram-Init-Data`
 * (уже используется в других route этого проекта).
 */
function extractInitData(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('tma ')) {
    return authHeader.slice(4).trim();
  }
  return req.headers.get('x-telegram-init-data');
}

const USER_SELECT_FIELDS = 'id, language, balance, free_generations_left, is_premium';

export async function POST(req: NextRequest) {
  try {
    // 1. Валидация initData ---------------------------------------------------
    const initData = extractInitData(req);
    if (!initData) {
      return NextResponse.json({ error: 'MISSING_INIT_DATA' }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[auth/telegram] TELEGRAM_BOT_TOKEN не задан');
      return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
    }

    const auth = validateTelegramInitData(initData, botToken);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: 'INVALID_TELEGRAM_SIGNATURE' }, { status: 401 });
    }

    const tgUser = auth.user;
    // Автоопределение языка интерфейса из Telegram; в будущем пользователь сможет
    // переопределить его вручную в /profile — тогда этот авто-апдейт нужно будет
    // делать только при ПЕРВОМ создании строки, а не при каждом входе.
    const language: 'ru' | 'uz' = tgUser.language_code === 'uz' ? 'uz' : 'ru';

    const supabase = createServerSupabaseClient();

    // 2. Проверяем, существует ли пользователь -------------------------------
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', tgUser.id)
      .maybeSingle();

    if (selectError) {
      console.error('[auth/telegram] Ошибка поиска пользователя', selectError);
      return NextResponse.json({ error: 'USER_LOOKUP_FAILED' }, { status: 500 });
    }

    // 3a. Пользователь уже существует — обновляем только профильные поля --------
    if (existingUser) {
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          first_name: tgUser.first_name,
          last_name: tgUser.last_name ?? null,
          telegram_username: tgUser.username ?? null,
          language,
        })
        .eq('id', existingUser.id)
        .select(USER_SELECT_FIELDS)
        .single();

      if (updateError || !updatedUser) {
        console.error('[auth/telegram] Ошибка обновления пользователя', updateError);
        return NextResponse.json({ error: 'USER_UPDATE_FAILED' }, { status: 500 });
      }

      return NextResponse.json({ user: updatedUser, isNewUser: false }, { status: 200 });
    }

    // 3b. Новый пользователь — создаём с дефолтными квотами ----------------------
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name ?? null,
        telegram_username: tgUser.username ?? null,
        language,
        balance: 0,
        free_generations_left: 1,
        is_premium: false,
      })
      .select(USER_SELECT_FIELDS)
      .single();

    if (insertError) {
      // Race condition: два одновременных запроса на онбординг одного и того же нового
      // пользователя (например, двойной вызов эффекта в React Strict Mode) могут
      // столкнуться на unique(telegram_id). В этом случае просто читаем уже созданную строку,
      // вместо того чтобы отдавать ошибку пользователю.
      if (insertError.code === POSTGRES_UNIQUE_VIOLATION) {
        const { data: raceUser, error: raceError } = await supabase
          .from('users')
          .select(USER_SELECT_FIELDS)
          .eq('telegram_id', tgUser.id)
          .single();

        if (!raceError && raceUser) {
          return NextResponse.json({ user: raceUser, isNewUser: false }, { status: 200 });
        }
      }

      console.error('[auth/telegram] Ошибка создания пользователя', insertError);
      return NextResponse.json({ error: 'USER_CREATION_FAILED' }, { status: 500 });
    }

    return NextResponse.json({ user: newUser, isNewUser: true }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/auth/telegram] Непредвиденная ошибка', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}