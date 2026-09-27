// app/(twa)/generate/[templateId]/review/page.tsx
// Страница, на которую wizard (generate/[templateId]/page.tsx) делает router.push
// сразу после успешного ответа POST /api/generate. Здесь и происходит связка:
// загружаем сгенерированный документ по documentId → кладём markdown в состояние →
// рендерим <ReviewDocument />, которая уже умеет экспортировать PDF/DOCX.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import ReviewDocument from '@/components/ReviewDocument';

type Locale = 'ru' | 'uz';

interface LoadedDocument {
  id: string;
  generated_content: string;
  language: Locale;
}

export default function DocumentReviewPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const documentId = searchParams.get('documentId');

  // Состояние, о котором просили явно: markdown документа, доступный дочернему
  // компоненту только после успешной загрузки с бэкенда.
  const [generatedMd, setGeneratedMd] = useState<string | null>(null);
  const [language, setLanguage] = useState<Locale>('ru');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setLoadError('missing_document_id');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadDocument() {
      try {
        setIsLoading(true);
        const tg = (window as any)?.Telegram?.WebApp;
        const initData: string = tg?.initData ?? '';

        const res = await fetch(`/api/documents/${documentId}`, {
          headers: { 'X-Telegram-Init-Data': initData },
        });
        const data = await res.json();

        if (!res.ok || !data?.document) {
          throw new Error(data?.error || 'load_failed');
        }

        const doc = data.document as LoadedDocument;

        if (!cancelled) {
          setGeneratedMd(doc.generated_content);
          setLanguage(doc.language ?? 'ru');
        }
      } catch {
        if (!cancelled) setLoadError('load_failed');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadDocument();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  function handleBack() {
    // Возврат к форме — например, чтобы перегенерировать документ с другими данными.
    router.push(`/generate/${templateId}`);
  }

  // ------------------------------------------------------------------
  // Состояния загрузки / ошибки
  // ------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (loadError || !generatedMd || !documentId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-slate-500">
          {language === 'ru'
            ? 'Не удалось загрузить документ. Попробуйте вернуться к форме и сгенерировать заново.'
            : 'Hujjatni yuklab bo‘lmadi. Formaga qaytib, qayta yaratib ko‘ring.'}
        </p>
        <button
          onClick={handleBack}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white active:scale-[0.98]"
        >
          {language === 'ru' ? 'Назад к форме' : 'Formaga qaytish'}
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Основной рендер: связка generatedMd (state) → ReviewDocument
  // ------------------------------------------------------------------
  return (
    <ReviewDocument
      markdown={generatedMd}
      documentId={documentId}
      onBack={handleBack}
      language={language}
    />
  );
}