// app/(twa)/documents/page.tsx
// Страница истории документов пользователя. Загружает список через GET /api/documents,
// показывает скелетон во время загрузки, красивый empty state при отсутствии документов,
// и список карточек с бейджем статуса при наличии.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileStack,
  FileText,
  Home,
  Briefcase,
  FileWarning,
  ChevronRight,
  CheckCircle2,
  Loader2,
  XCircle,
  Plus,
} from 'lucide-react';

type Locale = 'ru' | 'uz';
type DocumentStatus = 'draft' | 'generating' | 'completed' | 'failed';

interface DocumentTemplateRef {
  title_ru: string;
  title_uz: string;
  category: 'rent' | 'business' | 'claims' | 'other';
}

interface DocumentRow {
  id: string;
  status: DocumentStatus;
  language: Locale;
  created_at: string;
  pdf_url: string | null;
  docx_url: string | null;
  template_id: string;
  // Supabase может вернуть join как объект или как null, если запись была удалена
  document_templates: DocumentTemplateRef | null;
}

const TEXT: Record<
  Locale,
  {
    title: string;
    emptyTitle: string;
    emptySubtitle: string;
    createCta: string;
    statusLabels: Record<DocumentStatus, string>;
  }
> = {
  ru: {
    title: 'Мои документы',
    emptyTitle: 'У вас пока нет документов',
    emptySubtitle: 'Создайте первый документ — это займёт пару минут',
    createCta: 'Создать документ',
    statusLabels: {
      completed: 'Готов',
      generating: 'Генерируется',
      failed: 'Ошибка',
      draft: 'Черновик',
    },
  },
  uz: {
    title: 'Mening hujjatlarim',
    emptyTitle: 'Sizda hali hujjatlar yo‘q',
    emptySubtitle: 'Birinchi hujjatni yarating — bu bir necha daqiqa vaqt oladi',
    createCta: 'Hujjat yaratish',
    statusLabels: {
      completed: 'Tayyor',
      generating: 'Yaratilmoqda',
      failed: 'Xatolik',
      draft: 'Qoralama',
    },
  },
};

const CATEGORY_ICON: Record<DocumentTemplateRef['category'], React.ElementType> = {
  rent: Home,
  business: Briefcase,
  claims: FileWarning,
  other: FileText,
};

export default function DocumentsPage() {
  const router = useRouter();

  const [locale, setLocale] = useState<Locale>('ru');
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const t = TEXT[locale];

  // ------------------------------------------------------------------
  // Инициализация Telegram WebApp: язык + системная кнопка "Назад"
  // ------------------------------------------------------------------
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    if (tg.initDataUnsafe?.user?.language_code === 'uz') setLocale('uz');

    tg.BackButton.show();
    const handleBack = () => router.back();
    tg.BackButton.onClick(handleBack);

    return () => {
      tg.BackButton.offClick(handleBack);
      tg.BackButton.hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Загрузка списка документов
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadDocuments() {
      try {
        setIsLoading(true);
        setLoadError(null);

        const tg = (window as any)?.Telegram?.WebApp;
        const initData: string = tg?.initData ?? '';

        const res = await fetch('/api/documents', {
          headers: { Authorization: `tma ${initData}` },
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || 'fetch_failed');
        }

        if (!cancelled) setDocuments(data.documents ?? []);
      } catch {
        if (!cancelled) setLoadError('fetch_failed');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadDocuments();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleOpenDocument(doc: DocumentRow) {
    // Открываем предпросмотр только для успешно сгенерированных документов —
    // для 'generating'/'failed'/'draft' там просто нечего показывать.
    if (doc.status !== 'completed') return;
    router.push(`/generate/${doc.template_id}/review?documentId=${doc.id}`);
  }

  return (
    <main className="min-h-screen bg-[var(--tg-theme-bg-color,#f8fafc)] pb-10 pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-5">
        <h1 className="text-xl font-bold text-slate-900">{t.title}</h1>

        {/* Загрузка — скелетон */}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Ошибка загрузки */}
        {!isLoading && loadError && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-red-200 bg-red-50/50 px-4 py-10 text-center">
            <XCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-500">
              {locale === 'ru' ? 'Не удалось загрузить документы' : 'Hujjatlarni yuklab bo‘lmadi'}
            </p>
          </div>
        )}

        {/* Пустое состояние */}
        {!isLoading && !loadError && documents && documents.length === 0 && (
          <EmptyState locale={locale} onCreate={() => router.push('/')} />
        )}

        {/* Список документов */}
        {!isLoading && !loadError && documents && documents.length > 0 && (
          <div className="flex flex-col gap-3">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                locale={locale}
                statusLabel={t.statusLabels[doc.status]}
                onClick={() => handleOpenDocument(doc)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// --------------------------------------------------------------------
// Карточка документа
// --------------------------------------------------------------------
function DocumentCard({
  doc,
  locale,
  statusLabel,
  onClick,
}: {
  doc: DocumentRow;
  locale: Locale;
  statusLabel: string;
  onClick: () => void;
}) {
  const category = doc.document_templates?.category ?? 'other';
  const Icon = CATEGORY_ICON[category];
  const title =
    (locale === 'ru' ? doc.document_templates?.title_ru : doc.document_templates?.title_uz) ??
    (locale === 'ru' ? 'Документ' : 'Hujjat');

  const formattedDate = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(doc.created_at));

  const isClickable = doc.status === 'completed';

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={`
        flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm
        transition active:scale-[0.98]
        ${isClickable ? 'active:shadow-none' : 'cursor-default opacity-80'}
      `}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-400">{formattedDate}</p>
      </div>

      <StatusBadge status={doc.status} label={statusLabel} />

      {isClickable && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
    </button>
  );
}

// --------------------------------------------------------------------
// Бейдж статуса: зелёный / жёлтый / красный / серый
// --------------------------------------------------------------------
function StatusBadge({ status, label }: { status: DocumentStatus; label: string }) {
  const config: Record<DocumentStatus, { classes: string; icon: React.ElementType; spin?: boolean }> = {
    completed: { classes: 'bg-emerald-50 text-emerald-600 ring-emerald-100', icon: CheckCircle2 },
    generating: { classes: 'bg-amber-50 text-amber-600 ring-amber-100', icon: Loader2, spin: true },
    failed: { classes: 'bg-red-50 text-red-600 ring-red-100', icon: XCircle },
    draft: { classes: 'bg-slate-100 text-slate-500 ring-slate-200', icon: FileText },
  };

  const { classes, icon: Icon, spin } = config[status];

  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${classes}`}>
      <Icon className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

// --------------------------------------------------------------------
// Скелетон-карточка на время загрузки
// --------------------------------------------------------------------
function SkeletonCard() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-slate-100" />
    </div>
  );
}

// --------------------------------------------------------------------
// Пустое состояние — документов ещё нет
// --------------------------------------------------------------------
function EmptyState({ locale, onCreate }: { locale: Locale; onCreate: () => void }) {
  const t = TEXT[locale];

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <FileStack className="h-7 w-7 text-blue-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{t.emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-400">{t.emptySubtitle}</p>
      </div>
      <button
        onClick={onCreate}
        className="mt-2 flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" />
        {t.createCta}
      </button>
    </div>
  );
}