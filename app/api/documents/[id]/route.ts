// app/api/documents/[id]/route.ts
// GET /api/documents/:id
// Отдаёт содержимое конкретного сгенерированного документа владельцу.
// Используется страницей review сразу после создания документа в /api/generate,
// а также при повторном открытии документа из "Моих документов".

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateTelegramInitData } from '@/lib/telegram/validateInitData';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const initData = req.headers.get('x-telegram-init-data');
    if (!initData) return NextResponse.json({ error: 'MISSING_INIT_DATA' }, { status: 401 });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });

    const auth = validateTelegramInitData(initData, botToken);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: 'INVALID_TELEGRAM_SIGNATURE' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', auth.user.id)
      .maybeSingle();

    if (!user) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });

    const { data: doc, error } = await supabase
      .from('generated_documents')
      .select(
        'id, user_id, status, language, generated_content, pdf_url, docx_url, created_at, document_templates ( title_ru, title_uz, category )'
      )
      .eq('id', id)
      .maybeSingle();

    if (error || !doc) {
      return NextResponse.json({ error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    }

    if (doc.user_id !== user.id) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    return NextResponse.json({ document: doc }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/documents/:id] Непредвиденная ошибка', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}