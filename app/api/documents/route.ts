// app/api/documents/route.ts
// GET /api/documents
// Возвращает историю сгенерированных документов текущего Telegram-пользователя,
// отсортированную по дате создания (новые сверху). Используется страницей
// app/(twa)/documents/page.tsx.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateTelegramInitData } from '@/lib/telegram/validateInitData';

/**
 * Извлекает initData из запроса.
 * Приоритет — заголовок `Authorization: tma <initData>` (официальная схема Telegram
 * для Mini Apps: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Для обратной совместимости также принимаем `X-Telegram-Auth` и `X-Telegram-Init-Data`
 * (последний уже используется в других route этого проекта — см. /api/generate).
 *
 * TODO: со временем стоит унифицировать все route на единую схему (лучше всего —
 * middleware.ts, который сам достаёт initData и прокидывает провалидированного
 * пользователя дальше через заголовок/контекст), чтобы не дублировать эту логику.
 */
function extractInitData(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('tma ')) {
    return authHeader.slice(4).trim();
  }
  return req.headers.get('x-telegram-auth') || req.headers.get('x-telegram-init-data');
}

export async function GET(req: NextRequest) {
  try {
    // 1. Авторизация ----------------------------------------------------------
    const initData = extractInitData(req);
    if (!initData) {
      return NextResponse.json({ error: 'MISSING_INIT_DATA' }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[GET /api/documents] TELEGRAM_BOT_TOKEN не задан');
      return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
    }

    const auth = validateTelegramInitData(initData, botToken);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: 'INVALID_TELEGRAM_SIGNATURE' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    // 2. Резолвим внутреннего пользователя -------------------------------------
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', auth.user.id)
      .maybeSingle();

    if (userError) {
      console.error('[GET /api/documents] Ошибка поиска пользователя', userError);
      return NextResponse.json({ error: 'USER_LOOKUP_FAILED' }, { status: 500 });
    }

    // Пользователь мог ни разу не генерировать документы (и, соответственно,
    // ещё не быть создан в таблице users при первом визите на эту страницу) —
    // это не ошибка, а просто пустая история.
    if (!user) {
      return NextResponse.json({ documents: [] }, { status: 200 });
    }

    // 3. Загружаем документы пользователя вместе с названием шаблона -------------
    const { data: documents, error: documentsError } = await supabase
      .from('generated_documents')
      .select(
        `
        id,
        status,
        language,
        created_at,
        pdf_url,
        docx_url,
        template_id,
        document_templates ( title_ru, title_uz, category )
      `
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (documentsError) {
      console.error('[GET /api/documents] Ошибка загрузки документов', documentsError);
      return NextResponse.json({ error: 'FETCH_FAILED' }, { status: 500 });
    }

    return NextResponse.json({ documents: documents ?? [] }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/documents] Непредвиденная ошибка', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}