// One category (slice P1.17; tiles and counts P1.18). A main category shows
// its sub-categories as tiles, each with how many the Centre has and how many
// work; a sub-category shows its own numbers, each opening the Items list.
// Both can be renamed and switched off or back on (never deleted).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pencil, Plus } from "lucide-react";
import { Card, CardTitle, LinkButton, PageHeader, PageNotice, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { NO_COUNT } from "@/lib/categories/counts";
import { categoryGroups } from "@/lib/categories/rules";
import { createClient } from "@/lib/supabase/server";
import { allCategories, categoryCounts, MAY_SEE_CATEGORIES, UUID } from "../data";
import { SwitchCategory } from "../forms";
import { CategoryBadge } from "../category-icon";
import { CountLinks } from "../count-links";
import { CategoryTile, CountLine } from "../tile";

export const metadata: Metadata = { title: "Category | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Category added.",
  saved: "Changes saved.",
  "switched-off": "Switched off. Its items and history stay, and it can be switched back on.",
  "switched-on": "Switched back on.",
};

export default function CategoryPage(props: PageProps<"/categories/[id]">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/categories/[id]">["params"];
  searchParams: PageProps<"/categories/[id]">["searchParams"];
}) {
  const me = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const all = await allCategories(supabase);
  const category = all.find((c) => c.id === id);
  if (!category) notFound();

  const main = category.parent_id ? all.find((c) => c.id === category.parent_id) : undefined;
  const isSub = Boolean(main);
  const groups = categoryGroups(all, { showOff: true });
  const subs = groups.find((g) => g.main.id === id)?.subs ?? [];
  const counts = await categoryCounts(supabase, groups);
  const own = counts.get(id) ?? NO_COUNT;
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/categories", label: "Categories" }, ...(main ? [{ href: `/categories/${main.id}`, label: main.name }] : [])]}
        title={
          <span className="flex items-center gap-3">
            <CategoryBadge icon={(main ?? category).icon} size="lg" />
            {category.name}
          </span>
        }
        subtitle={
          <>
            <span data-testid="category-level">{isSub ? "Sub-category" : "Main category"}</span>
            {main && (
              <>
                {" "}
                inside{" "}
                <Link href={`/categories/${main.id}`} data-testid="category-main">
                  {main.name}
                </Link>
              </>
            )}
          </>
        }
        status={!category.active ? <StatusBadge word="Switched off" tone="grey" /> : undefined}
        actions={
          <LinkButton href={`/categories/${id}/edit`} icon={Pencil} kind="outline">
            Rename
          </LinkButton>
        }
      />
      {done && <PageNotice floating>{done}</PageNotice>}

      <div className="mt-4 space-y-4">
        <Card>
          <CardTitle>{isSub ? "How many we have" : "In this main category"}</CardTitle>
          <p data-testid="category-item-count">
            <CountLine count={own} />
          </p>
          <CountLinks count={own} category={id} />
        </Card>

        {!isSub && (
          <section aria-labelledby="subs-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="subs-title" className="text-lg font-bold text-icci-green-dark">
                Sub-categories
              </h2>
              {category.active && (
                <LinkButton href={`/categories/new?inside=${id}`} icon={Plus} kind="secondary">
                  Add a sub-category
                </LinkButton>
              )}
            </div>
            {subs.length === 0 ? (
              <p className="text-icci-ink-60">None yet. Items can only be put in a sub-category, so add at least one.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="sub-categories">
                {subs.map((s) => (
                  <li key={s.id}>
                    <CategoryTile href={`/categories/${s.id}`} icon={category.icon} name={s.name} active={s.active}>
                      <CountLine count={counts.get(s.id) ?? NO_COUNT} />
                    </CategoryTile>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <Card>
          <CardTitle>{category.active ? "Switch off" : "Switched off"}</CardTitle>
          <SwitchCategory categoryId={id} active={category.active} isSub={isSub} />
        </Card>
      </div>
    </>
  );
}
