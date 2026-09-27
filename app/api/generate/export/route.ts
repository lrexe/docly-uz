// app/api/generate/export/route.ts
// POST /api/generate/export
// Конвертирует уже сгенерированный документ (generated_documents.generated_content,
// markdown) в PDF или DOCX БЕЗ headless-браузера (см. lib/documents/generatePdf.ts
// и generateDocx.ts). Результат кэшируется в приватном Supabase Storage bucket
// "documents", а ссылка (signed URL) сохраняется в pdf_url/docx_url — повторный
// экспорт того же документа не требует повторной генерации файла.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateTelegramInitData } from '@/lib/telegram/validateInitData';
import { generatePdfBuffer } from '@/lib/documents/generatePdf';
import { generateDocxBuffer } from '@/lib/documents/generateDocx';

// pdfmake работает с файловой системой и Buffer — обязательно Node.js runtime,
// в Edge Runtime (по умолчанию для некоторых route) это упадёт.
export const runtime = 'nodejs';

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 дней

const requestSchema = z.object({
  documentId: z.string().uuid(),
  format: z.enum(['pdf', 'docx']),
});

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export async function POST(req: NextRequest) {
  try {
    // 1. Авторизация через Telegram initData -------------------------------
    const initData = req.headers.get('x-telegram-init-data');
    if (!initData) return NextResponse.json({ error: 'MISSING_INIT_DATA' }, { status: 401 });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[export] TELEGRAM_BOT_TOKEN не задан');
      return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
    }

    const auth = validateTelegramInitData(initData, botToken);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: 'INVALID_TELEGRAM_SIGNATURE' }, { status: 401 });
    }

    // 2. Валидация тела запроса ---------------------------------------------
    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_PAYLOAD', details: parsed.error.flatten() }, { status: 400 });
    }
    const { documentId, format } = parsed.data;

    const supabase = createServerSupabaseClient();

    // 3. Резолвим пользователя ------------------------------------------------
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', auth.user.id)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
    }

    // 4. Загружаем документ + название шаблона (для метаданных PDF/DOCX) --------
    const { data: doc, error: docError } = await supabase
      .from('generated_documents')
      .select('id, user_id, status, generated_content, pdf_url, docx_url, document_templates ( title_ru, title_uz )')
      .eq('id', documentId)
      .maybeSingle();

    if (docError || !doc) {
      return NextResponse.json({ error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    }

    // 5. Проверка владения документом ------------------------------------------
    if (doc.user_id !== user.id) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    if (doc.status !== 'completed' || !doc.generated_content) {
      return NextResponse.json({ error: 'DOCUMENT_NOT_READY' }, { status: 409 });
    }

    // 6. Если файл уже был сгенерирован ранее — просто отдаём готовую ссылку -----
    const cachedUrl = format === 'pdf' ? doc.pdf_url : doc.docx_url;
    if (cachedUrl) {
      return NextResponse.json({ url: cachedUrl, cached: true }, { status: 200 });
    }

    // 7. Генерируем файл нужного формата ---------------------------------------
    const templateTitle = (doc as any).document_templates?.title_ru ?? 'Docly.uz';

    let buffer: Buffer;
    try {
      buffer =
        format === 'pdf'
          ? await generatePdfBuffer(doc.generated_content, { title: templateTitle })
          : await generateDocxBuffer(doc.generated_content, { title: templateTitle });
    } catch (renderError: any) {
      console.error(`[export] Ошибка рендеринга ${format}`, renderError);
      return NextResponse.json({ error: 'RENDER_FAILED' }, { status: 500 });
    }

    // 8. Загружаем в приватный Storage bucket "documents" ------------------------
    const storagePath = `${user.id}/${documentId}.${format}`;

    const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, buffer, {
      contentType: CONTENT_TYPES[format],
      upsert: true,
    });

    if (uploadError) {
      console.error('[export] Ошибка загрузки в Storage', uploadError);
      return NextResponse.json({ error: 'UPLOAD_FAILED' }, { status: 500 });
    }

    // 9. Создаём подписанную ссылку (bucket приватный — прямого публичного URL нет) --
    const { data: signedUrlData, error: signError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signedUrlData?.signedUrl) {
      console.error('[export] Ошибка создания signed URL', signError);
      return NextResponse.json({ error: 'SIGN_URL_FAILED' }, { status: 500 });
    }

    // 10. Кэшируем ссылку в generated_documents для последующих запросов -----------
    await supabase
      .from('generated_documents')
      .update(format === 'pdf' ? { pdf_url: signedUrlData.signedUrl } : { docx_url: signedUrlData.signedUrl })
      .eq('id', documentId);

    return NextResponse.json({ url: signedUrlData.signedUrl, cached: false }, { status: 200 });
  } catch (error: any) {
    console.error('[POST /api/generate/export] Непредвиденная ошибка', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}