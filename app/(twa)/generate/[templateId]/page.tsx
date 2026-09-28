// app/(twa)/generate/[templateId]/page.tsx
// Экран-визард: загружает шаблон на сервере и отдаёт форму клиентскому компоненту.

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import GenerateWizard, { type WizardTemplate } from '@/components/twa/GenerateWizard';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GeneratePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  if (!UUID_RE.test(templateId)) notFound();

  const supabase = createServerSupabaseClient();
  const { data: template } = await supabase
    .from('document_templates')
    .select('id, category, title_ru, title_uz, form_schema')
    .eq('id', templateId)
    .eq('is_active', true)
    .maybeSingle();

  if (!template) notFound();

  return <GenerateWizard template={template as WizardTemplate} />;
}
