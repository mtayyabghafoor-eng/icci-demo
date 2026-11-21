// One category (slice P1.17). A main category shows its sub-categories and
// lets an admin add more; a sub-category shows which main category it is in.
// Both show how many items are filed there, with a link to the Items list,
// and can be renamed and switched off or back on (never deleted).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pencil, Plus } from "lucide-react";
import { Card, CardTitle, LinkButton, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryAndInside, compareCategoryNames } from "@/lib/categories/rules";
import { createClient } from "@/lib/supabase/server";
import { Notice, StatusBadge } from "../../items/ui";
import { allCategories, MAY_SEE_CATEGORIES, UUID } from "../data";
import { SwitchCategory } from "../forms";

export const metadata: Metadata = { title: "Category | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Category added.",
  saved: "Changes saved.",
  "switched-off": "Switched off. Its items and history stay, and it can be switched back on.",
  "switched-on": "Switched back on.",
};

export default function CategoryPage(props: PageProps<"/categories/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
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
  const subs = all.filter((c) => c.parent_id === id).sort((a, b) => compareCategoryNames(a.name, b.name));
  const { count } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .in("category_id", categoryAndInside(id, all))
    .or("condition.is.null,condition.neq.disposed");
  const items = count ?? 0;
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/categories", label: "Categories" }, ...(main ? [{ href: `/categories/${main.id}`, label: main.name }] : [])]}
        title={category.name}
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
      {done && <Notice floating>{done}</Notice>}

      <div className="mt-4 space-y-4">
        {!isSub && (
          <Card>
            <CardTitle
              action={
                category.active ? (
                  <LinkButton href={`/categories/new?inside=${id}`} icon={Plus} kind="secondary">
                    Add a sub-category
                  </LinkButton>
                ) : undefined
              }
            >
              Sub-categories
            </CardTitle>
            {subs.length === 0 ? (
              <p className="text-icci-ink-60">None yet. Items can only be put in a sub-category, so add at least one.</p>
            ) : (
              <ul className="divide-y divide-icci-line" data-testid="sub-categories">
                {subs.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <Link href={`/categories/${s.id}`} className="font-semibold">
                      {s.name}
                    </Link>
                    {!s.active && <StatusBadge word="Switched off" tone="grey" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card>
          <CardTitle>Items</CardTitle>
          <p data-testid="category-item-count">
            {items === 0
              ? `No items are filed ${isSub ? "here" : "in this main category"} yet.`
              : `${items} item${items === 1 ? " is" : "s are"} filed ${isSub ? "here" : "in this main category"} (disposed items left out).`}{" "}
            {items > 0 && <Link href={`/items?category=${id}`}>See them in the Items list</Link>}
          </p>
        </Card>

        <Card>
          <CardTitle>{category.active ? "Switch off" : "Switched off"}</CardTitle>
          <SwitchCategory categoryId={id} active={category.active} isSub={isSub} />
        </Card>
      </div>
    </>
  );
}
