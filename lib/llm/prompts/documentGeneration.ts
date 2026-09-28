// lib/llm/prompts/documentGeneration.ts
// Строит system + user промпты для генерации юридического документа через OpenRouter.
// Комбинирует: базовый шаблон документа, ответы пользователя и юридические guardrails.

export interface TemplateFieldOption {
  value: string;
  label_ru: string;
  label_uz: string;
}

export interface TemplateField {
  key: string;
  placeholder?: string;
  type: 'text' | 'number' | 'date' | 'select' | 'radio' | 'textarea';
  label_ru: string;
  label_uz: string;
  required?: boolean;
  options?: TemplateFieldOption[];
  step?: number; // необязательная группировка полей по шагам wizard'а
}

export interface TemplateForPrompt {
  id: string;
  slug: string;
  category: string;
  title_ru: string;
  title_uz: string;
  form_schema: TemplateField[];
  base_template_ru?: string | null;
  base_template_uz?: string | null;
  llm_system_prompt?: string | null; // специфичные для шаблона инструкции из БД
}

export interface BuildPromptParams {
  template: TemplateForPrompt;
  inputData: Record<string, string | number | null>;
  language: 'ru' | 'uz';
  /** Фрагменты законодательства РУз, найденные через RAG (lib/llm/rag.ts). */
  legalContext?: string[];
}

// ----------------------------------------------------------------------
// Юридические ограничения ("guardrails"), обязательные для КАЖДОГО промпта.
// Цель: не давать юридических консультаций, не выдумывать статьи закона,
// строго соблюдать структуру документа.
// ----------------------------------------------------------------------
const LEGAL_GUARDRAILS_RU = `
ЖЁСТКИЕ ПРАВИЛА (обязательны к соблюдению без исключений):
1. Ты — генератор ЮРИДИЧЕСКИХ ДОКУМЕНТОВ, а не юрист-консультант. Никогда не давай советов,
   оценок рисков или толкований закона от первого лица — только формируй текст документа.
2. Если в предоставленных данных не хватает информации для корректного заполнения пункта —
   вставь плейсхолдер вида [УКАЗАТЬ: описание недостающих данных], НЕ придумывай факты.
3. Запрещено ссылаться на статьи, кодексы или номера законов, которых нет в переданном
   ниже юридическом контексте (RAG). Если контекст пуст — используй только общепринятые
   формулировки без указания конкретных номеров статей.
4. Строго следуй структуре и порядку разделов, заданным в базовом шаблоне документа.
5. Все денежные суммы указывай и цифрами, и прописью на языке документа.
6. Документ должен соответствовать законодательству Республики Узбекистан. При коллизии
   между запросом пользователя и обязательными реквизитами документа — приоритет у закона.
7. Не добавляй пояснений, комментариев или markdown-разметки вне текста документа.
   Ответ должен содержать ТОЛЬКО финальный текст документа, без вводных фраз.
`.trim();

const LEGAL_GUARDRAILS_UZ = `
QAT'IY QOIDALAR (istisnosiz bajarilishi shart):
1. Sen YURIDIK HUJJATLAR generatorisan, huquqiy maslahatchi emassan. Hech qachon birinchi
   shaxsdan maslahat, xavflarni baholash yoki qonunni izohlashni bermang — faqat hujjat matnini shakllantiring.
2. Agar band uchun ma'lumot yetarli bo'lmasa — [KIRITISH KERAK: yetishmayotgan ma'lumot tavsifi]
   ko'rinishidagi belgi qo'ying, faktlarni o'ylab topmang.
3. Quyida berilgan yuridik kontekstda (RAG) yo'q moddalar, kodekslar yoki qonun raqamlariga
   murojaat qilish taqiqlanadi. Kontekst bo'sh bo'lsa — faqat umumiy qabul qilingan iboralardan
   foydalaning, aniq modda raqamlarisiz.
4. Bazaviy shablonda berilgan bo'limlar tartibi va tuzilishiga qat'iy rioya qiling.
5. Barcha pul miqdorlarini raqamda ham, hujjat tilida so'z bilan ham ko'rsating.
6. Hujjat O'zbekiston Respublikasi qonunchiligiga mos bo'lishi kerak. Foydalanuvchi so'rovi
   va hujjatning majburiy rekvizitlari o'rtasida ziddiyat bo'lsa — qonun ustuvor.
7. Hujjat matnidan tashqari hech qanday izoh yoki markdown formatlash qo'shmang.
   Javobda FAQAT hujjatning yakuniy matni bo'lishi kerak.
`.trim();

/** Человекочитаемое описание типа значения поля — помогает LLM понять формат данных. */
function formatFieldValue(field: TemplateField): string {
  switch (field.type) {
    case 'date':
      return 'дата';
    case 'number':
      return 'число';
    case 'select':
    case 'radio':
      return `один из вариантов: ${field.options?.map((o) => o.value).join(', ') ?? ''}`;
    default:
      return 'текст';
  }
}

function describeField(field: TemplateField, language: 'ru' | 'uz'): string {
  const label = language === 'ru' ? field.label_ru : field.label_uz;
  return `- ${label} (ключ: ${field.key}): ${formatFieldValue(field)}`;
}

/**
 * Формирует финальную пару сообщений (system + user) для запроса к OpenRouter.
 * system — роль, ограничения и базовый шаблон.
 * user — конкретные данные пользователя для подстановки.
 */
export function buildDocumentGenerationPrompt({
  template,
  inputData,
  language,
  legalContext = [],
}: BuildPromptParams): { systemPrompt: string; userPrompt: string } {
  const guardrails = language === 'ru' ? LEGAL_GUARDRAILS_RU : LEGAL_GUARDRAILS_UZ;
  const title = language === 'ru' ? template.title_ru : template.title_uz;
  const baseTemplate =
    (language === 'ru' ? template.base_template_ru : template.base_template_uz) ?? '';

  const contextBlock =
    legalContext.length > 0
      ? `\n\nЮРИДИЧЕСКИЙ КОНТЕКСТ (используй ТОЛЬКО эти нормы, не придумывай другие):\n${legalContext
          .map((c, i) => `[${i + 1}] ${c}`)
          .join('\n')}`
      : '\n\nЮРИДИЧЕСКИЙ КОНТЕКСТ: не предоставлен — избегай ссылок на конкретные статьи закона.';

  const systemPrompt = `
Ты — движок генерации юридических документов сервиса Docly.uz для Республики Узбекистан.
Тип документа: "${title}" (категория: ${template.category}).
Язык итогового документа: ${language === 'ru' ? 'русский' : 'o‘zbek tili'}.

${template.llm_system_prompt ? `СПЕЦИФИКА ЭТОГО ТИПА ДОКУМЕНТА:\n${template.llm_system_prompt}\n` : ''}
${guardrails}
${contextBlock}

БАЗОВЫЙ ШАБЛОН ДОКУМЕНТА (сохраняй структуру, заменяй плейсхолдеры реальными данными):
"""
${baseTemplate || '[Базовый шаблон не задан — построй документ по стандартной для данного типа структуре.]'}
"""
`.trim();

  const fieldsDescription = template.form_schema.map((f) => describeField(f, language)).join('\n');

  const userPrompt = `
Данные, введённые пользователем (JSON, ключи соответствуют полям формы):

${JSON.stringify(inputData, null, 2)}

Справка по полям формы:
${fieldsDescription}

Сгенерируй финальный текст документа "${title}" на языке "${language}", подставив эти данные
в базовый шаблон и строго следуя ЖЁСТКИМ ПРАВИЛАМ из системного сообщения.
`.trim();

  return { systemPrompt, userPrompt };
}