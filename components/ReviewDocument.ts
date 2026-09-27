// components/ReviewDocument.tsx
// Показывает сгенерированный документ (markdown) в читаемом виде и даёт
// возможность скачать PDF/DOCX или скопировать текст. Экспорт делегируется
// на бэкенд (app/api/generate/export/route.ts) — компонент только вызывает API
// и открывает готовую (закэшированную) ссылку на файл.

'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronLeft, Download, FileText, Copy, Check, Loader2, AlertCircle } from 'lucide-react';

type Locale = 'ru' | 'uz';
type ExportFormat = 'pdf' | 'docx';

interface ReviewDocumentProps {
  /** Markdown-текст документа, сгенерированный LLM. */
  markdown: string;
  /** ID записи в generated_documents — нужен для запроса экспорта. */
  documentId: string;
  /** Возврат к форме (например, чтобы перегенерировать документ с другими данными). */
  onBack: () => void;
  /** Язык интерфейса (по умолчанию 'ru'). */
  language?: Locale;
}

const TEXT: Record<Locale, { back: string; downloadPdf: string; downloadDocx: string; copy: string; copied: string; exportError: string }> = {
  ru: {
    back: 'Назад',
    downloadPdf: 'Скачать PDF',
    downloadDocx: 'Скачать DOCX',
    copy: 'Копировать текст',
    copied: 'Скопировано',
    exportError: 'Не удалось подготовить файл. Попробуйте ещё раз.',
  },
  uz: {
    back: 'Orqaga',
    downloadPdf: 'PDF yuklab olish',
    downloadDocx: 'DOCX yuklab olish',
    copy: 'Matnni nusxalash',
    copied: 'Nusxalandi',
    exportError: 'Faylni tayyorlab bo‘lmadi. Qayta urinib ko‘ring.',
  },
};

/** Грубая, но достаточная очистка markdown-разметки для "чистого" копирования в буфер. */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '') // заголовки
    .replace(/\*\*(.*?)\*\*/g, '$1') // жирный
    .replace(/\*(.*?)\*/g, '$1') // курсив
    .replace(/`(.*?)`/g, '$1') // инлайн-код
    .replace(/^\s*[-*+]\s+/gm, '• ') // маркированные списки
    .replace(/^\s*\d+\.\s+/gm, (m) => m) // нумерованные списки — оставляем как есть
    .replace(/^>\s?/gm, '') // цитаты
    .trim();
}

export default function ReviewDocument({ markdown, documentId, onBack, language = 'ru' }: ReviewDocumentProps) {
  const t = TEXT[language];

  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleExport(format: ExportFormat) {
    setExportingFormat(format);
    setExportError(null);

    try {
      const tg = (window as any)?.Telegram?.WebApp;
      const initData: string = tg?.initData ?? '';

      const res = await fetch('/api/generate/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({ documentId, format }),
      });

      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'export_failed');
      }

      // Внутри Telegram Mini App предпочитаем tg.openLink — гарантированно откроет
      // системный браузер/загрузчик. Вне Telegram — обычный window.open.
      if (tg?.openLink) {
        tg.openLink(data.url);
      } else {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setExportError(t.exportError);
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(stripMarkdown(markdown));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError(t.exportError);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--tg-theme-bg-color,#f8fafc)]">
      {/* Шапка */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/90 px-4 py-3 pt-[env(safe-area-inset-top,12px)] backdrop-blur">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 active:scale-95"
          aria-label={t.back}
        >
          <ChevronLeft className="h-5 w-5 text-slate-600" />
        </button>
        <h1 className="text-sm font-semibold text-slate-500">
          {language === 'ru' ? 'Предпросмотр документа' : 'Hujjatni ko‘rib chiqish'}
        </h1>
      </div>

      {/* Содержимое документа */}
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-5 pb-40">
        <article
          className="
            prose prose-sm sm:prose-base max-w-none rounded-2xl bg-white p-5 shadow-sm
            prose-headings:font-semibold prose-headings:text-slate-900
            prose-p:text-slate-700 prose-table:text-sm prose-th:bg-slate-50
          "
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>

        {exportError && (
          <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {exportError}
          </p>
        )}
      </div>

      {/* Нижняя панель действий (Floating Action Bar) */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          <div className="flex gap-2">
            <ActionButton
              icon={exportingFormat === 'pdf' ? Loader2 : Download}
              iconSpin={exportingFormat === 'pdf'}
              label={t.downloadPdf}
              onClick={() => handleExport('pdf')}
              disabled={exportingFormat !== null}
              variant="primary"
            />
            <ActionButton
              icon={exportingFormat === 'docx' ? Loader2 : FileText}
              iconSpin={exportingFormat === 'docx'}
              label={t.downloadDocx}
              onClick={() => handleExport('docx')}
              disabled={exportingFormat !== null}
              variant="secondary"
            />
          </div>
          <ActionButton
            icon={copied ? Check : Copy}
            label={copied ? t.copied : t.copy}
            onClick={handleCopy}
            disabled={exportingFormat !== null}
            variant="ghost"
          />
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------
// Небольшая переиспользуемая кнопка панели действий
// --------------------------------------------------------------------
function ActionButton({
  icon: Icon,
  iconSpin = false,
  label,
  onClick,
  disabled,
  variant,
}: {
  icon: React.ElementType;
  iconSpin?: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant: 'primary' | 'secondary' | 'ghost';
}) {
  const variantClasses = {
    primary: 'bg-blue-600 text-white active:bg-blue-700',
    secondary: 'bg-slate-900 text-white active:bg-slate-800',
    ghost: 'bg-slate-50 text-slate-600 border border-slate-200 active:bg-slate-100',
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold
        transition active:scale-[0.98] disabled:opacity-60 ${variantClasses}
      `}
    >
      <Icon className={`h-4 w-4 ${iconSpin ? 'animate-spin' : ''}`} />
      {label}
    </button>
  );
}