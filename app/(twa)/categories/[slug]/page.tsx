import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import TemplateList, { type TemplateRow } from '@/components/twa/TemplateList';

export const dynamic = 'force-dynamic';

const SLUGS = ['rent', 'business', 'claims'] as const;

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(SLUGS as readonly string[]).includes(slug)) notFound();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('document_templates')
    .select('id, title_ru, title_uz, description_ru, description_uz, price_tiyin')
    .eq('category', slug)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) console.error('[categories/[slug]] failed to load templates:', error.message, error.code);

  return <TemplateList category={slug as (typeof SLUGS)[number]} templates={(data ?? []) as TemplateRow[]} />;
}
