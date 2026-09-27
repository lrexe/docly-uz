// app/api/generate/route.ts
// POST /api/generate
// Принимает templateId + inputData + language, валидирует Telegram initData,
// вызывает OpenRouter (Claude 3.5 Sonnet / GPT-4o) и сохраняет результат в generated_documents.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateTelegramInitData } from '@/lib/telegram/validateInitData';
import { buildDocumentGenerationPrompt, type TemplateField } from '@/lib/llm/prompts/documentGeneration';

// Модель по умолчанию — переопределяется через .env (позволяет A/B-тестировать
// Claude 3.5 Sonnet против GPT-4o без деплоя).
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

// ------------------------------------------------------------------------
// Валидация входного payload
// ------------------------------------------------------------------------
const requestSchema = z.object({
  templateId: z.string().uuid(),
  inputData: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  language: z.enum(['ru', 'uz']),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Проверка подлинности запроса из Telegram Mini App -----------------
    const initData = req.headers.get('x-telegram-init-data');
    if (!initData) {
      return NextResponse.json({ error: 'MISSING_INIT_DATA' }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[generate] TELEGRAM_BOT_TOKEN не задан в .env');
      return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
    }

    const authResult = validateTelegramInitData(initData, botToken);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: 'INVALID_TELEGRAM_SIGNATURE' }, { status: 401 });
    }

    // 2. Валидация тела запроса --------------------------------------------
    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_PAYLOAD', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { templateId, inputData, language } = parsed.data;

    const supabase = createServerSupabaseClient();

    // 3. Резолвим внутреннего пользователя по telegram_id -------------------
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, free_generations_left, is_premium, balance')
      .eq('telegram_id', authResult.user.id)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
    }

    // 4. Проверка квоты/баланса ---------------------------------------------
    // Цена конкретного шаблона учитывается на этапе экспорта в PDF/DOCX (Payme/Click);
    // здесь — базовая проверка, что у пользователя вообще есть право на генерацию.
    if (!user.is_premium && user.free_generations_left <= 0 && user.balance <= 0) {
      return NextResponse.json(
        { error: 'INSUFFICIENT_BALANCE', message: 'Недостаточно средств или бесплатных генераций' },
        { status: 402 }
      );
    }

    // 5. Загружаем шаблон -----------------------------------------------------
    const { data: template, error: templateError } = await supabase
      .from('document_templates')
      .select('id, slug, category, title_ru, title_uz, form_schema, base_template_ru, base_template_uz, llm_system_prompt')
      .eq('id', templateId)
      .eq('is_active', true)
      .maybeSingle();

    if (templateError || !template) {
      return NextResponse.json({ error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
    }

    // 6. Проверяем, что все обязательные поля формы заполнены ------------------
    const formSchema = (template.form_schema ?? []) as TemplateField[];
    const missingFields = formSchema.filter(
      (field) => field.required && (inputData[field.key] === undefined || inputData[field.key] === '')
    );
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: 'MISSING_REQUIRED_FIELDS', fields: missingFields.map((f) => f.key) },
        { status: 400 }
      );
    }

    // 7. Создаём черновик документа (status: generating) заранее --------------
    // Это гарантирует, что даже при сбое LLM у нас останется аудиторский след
    // с введёнными пользователем данными.
    const { data: draftDoc, error: draftError } = await supabase
      .from('generated_documents')
      .insert({
        user_id: user.id,
        template_id: templateId,
        language,
        input_data: inputData,
        status: 'generating',
      })
      .select('id')
      .single();

    if (draftError || !draftDoc) {
      console.error('[generate] Не удалось создать черновик документа', draftError);
      return NextResponse.json({ error: 'DRAFT_CREATION_FAILED' }, { status: 500 });
    }

    // 8. RAG: подтягиваем релевантные нормы законодательства -------------------
    // TODO(Step 3): заменить на реальный pgvector similarity search
    // в lib/llm/rag.ts (эмбеддинг запроса → поиск по document_templates.embedding
    // и будущей таблице legal_norms). Пока — безопасная заглушка.
    const legalContext = await retrieveLegalContext(template, inputData);

    // 9. Строим промпт ------------------------------------------------------
    const { systemPrompt, userPrompt } = buildDocumentGenerationPrompt({
      template,
      inputData,
      language,
      legalContext,
    });

    // 10. Запрос к OpenRouter -------------------------------------------------
    let generatedContent: string;
    let tokensUsed: number | undefined;

    try {
      const llmResponse = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          // Обязательные заголовки для OpenRouter (аналитика/рейтинг приложения)
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://docly.uz',
          'X-Title': 'Docly.uz',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          temperature: 0.2, // низкая температура — важна предсказуемость для юр. текста
          max_tokens: 4000,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        throw new Error(`OpenRouter ${llmResponse.status}: ${errorText.slice(0, 300)}`);
      }

      const llmData = await llmResponse.json();
      generatedContent = llmData?.choices?.[0]?.message?.content?.trim();
      tokensUsed = llmData?.usage?.total_tokens;

      if (!generatedContent) {
        throw new Error('LLM вернул пустой ответ');
      }
    } catch (llmError: any) {
      console.error('[generate] Ошибка OpenRouter', llmError);
      await supabase
        .from('generated_documents')
        .update({ status: 'failed', error_message: String(llmError.message).slice(0, 500) })
        .eq('id', draftDoc.id);

      return NextResponse.json(
        { error: 'GENERATION_FAILED', documentId: draftDoc.id },
        { status: 502 }
      );
    }

    // 11. Сохраняем успешный результат -----------------------------------------
    const { error: updateError } = await supabase
      .from('generated_documents')
      .update({
        status: 'completed',
        generated_content: generatedContent,
        llm_model: DEFAULT_MODEL,
        llm_tokens_used: tokensUsed ?? null,
      })
      .eq('id', draftDoc.id);

    if (updateError) {
      console.error('[generate] Не удалось сохранить результат генерации', updateError);
      return NextResponse.json({ error: 'SAVE_FAILED', documentId: draftDoc.id }, { status: 500 });
    }

    // 12. Списываем одну бесплатную генерацию, если пользователь не премиум ------
    if (!user.is_premium && user.free_generations_left > 0) {
      await supabase
        .from('users')
        .update({ free_generations_left: user.free_generations_left - 1 })
        .eq('id', user.id);
    }

    return NextResponse.json(
      { documentId: draftDoc.id, content: generatedContent },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[POST /api/generate] Непредвиденная ошибка', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// --------------------------------------------------------------------------
// Временная заглушка RAG-поиска.
// В Шаге 3 будет заменена на реальную реализацию в lib/llm/rag.ts:
// эмбеддинг (inputData + template.category) → pgvector similarity search
// по нормам законодательства РУз, возврат top-k релевантных фрагментов.
// --------------------------------------------------------------------------
async function retrieveLegalContext(
  _template: { id: string; category: string },
  _inputData: Record<string, unknown>
): Promise<string[]> {
  return [];
}