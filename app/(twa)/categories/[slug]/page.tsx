import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * app/(twa)/categories/[slug]/page.tsx
 * Lists the active document templates that belong to one category
 * (Аренда / Бизнес / Претензии) and links each one into the generation wizard.
 */

const CATEGORY_MAP: Record<string, { titleRu: string; titleUz: string; emoji: string }> = {
  rent: { titleRu: "Аренда", titleUz: "Ijara", emoji: "🏠" },
  business: { titleRu: "Бизнес", titleUz: "Biznes", emoji: "💼" },
  claims: { titleRu: "Претензии", titleUz: "Da'volar", emoji: "⚖️" },
};

interface TemplateRow {
  id: string;
  title_ru: string;
  title_uz: string;
  description_ru: string | null;
  description_uz: string | null;
  price_tiyin: number;
  icon: string | null;
}

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const category = CATEGORY_MAP[params.slug];
  if (!category) notFound();

  const supabase = createClient();
  const { data: templates, error } = await supabase
    .from("document_templates")
    .select("id, title_ru, title_uz, description_ru, description_uz, price_tiyin, icon")
    .eq("category", params.slug)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[categories/[slug]] failed to load templates:", error);
  }

  const list = (templates ?? []) as TemplateRow[];

  return (
    <main
      className="min-h-screen px-4 pb-8 pt-4"
      style={{ background: "var(--tg-theme-bg-color, #ffffff)" }}
    >
      <header className="mb-5 flex items-center gap-2">
        <span className="text-2xl leading-none">{category.emoji}</span>
        <h1 className="text-xl font-semibold" style={{ color: "var(--tg-theme-text-color, #111111)" }}>
          {category.titleRu}
        </h1>
      </header>

      {list.length === 0 && (
        <p className="text-sm" style={{ color: "var(--tg-theme-hint-color, #999999)" }}>
          В этой категории пока нет доступных шаблонов. Загляните позже.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {list.map((tpl) => (
          <Link
            key={tpl.id}
            href={`/generate/${tpl.id}`}
            className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 transition-transform active:scale-[0.98]"
            style={{
              borderColor: "var(--tg-theme-hint-color, #eeeeee)",
              background: "var(--tg-theme-secondary-bg-color, #f7f7f8)",
            }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-2xl leading-none">{tpl.icon ?? "📄"}</span>
              <div className="min-w-0">
                <p className="truncate font-medium" style={{ color: "var(--tg-theme-text-color, #111111)" }}>
                  {tpl.title_ru}
                </p>
                {tpl.description_ru && (
                  <p
                    className="truncate text-xs opacity-80"
                    style={{ color: "var(--tg-theme-hint-color, #999999)" }}
                  >
                    {tpl.description_ru}
                  </p>
                )}
              </div>
            </div>
            <span
              className="shrink-0 text-sm font-semibold"
              style={{ color: "var(--tg-theme-link-color, #3390ec)" }}
            >
              {tpl.price_tiyin > 0 ? `${(tpl.price_tiyin / 100).toLocaleString("ru-RU")} сум` : "Бесплатно"}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}