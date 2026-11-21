// Categories (slice P1.17): every main category with its sub-categories,
// "Other" always last. Super Admins and Centre Admins add, rename, move and
// switch off categories from here; nothing is ever deleted.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FolderTree, Plus } from "lucide-react";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryGroups } from "@/lib/categories/rules";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "../items/ui";
import { allCategories, MAY_SEE_CATEGORIES } from "./data";

export const metadata: Metadata = { title: "Categories | ICCI Control Dashboard" };

export default function CategoriesPage(props: PageProps<"/categories">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<p>Loading categories…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/categories">["searchParams"] }) {
  const me = await requireAdmin();
  const showOff = (await searchParams).off === "1";
  const allowed = MAY_SEE_CATEGORIES.includes(me.roleCode);
  const header = (
    <PageHeader
      title="Categories"
      subtitle="What kind of thing each item is: a main category, then a sub-category inside it. Every item sits in a sub-category."
      actions={allowed ? <LinkButton href="/categories/new" icon={Plus}>Add a main category</LinkButton> : undefined}
    />
  );
  if (!allowed) {
    return (
      <>
        {header}
        <p data-testid="categories-not-allowed">Your account cannot see categories. Only a Super Admin or Centre Admin can.</p>
      </>
    );
  }
  const all = await allCategories(await createClient());
  const groups = categoryGroups(all, { showOff });
  const offCount = all.filter((c) => !c.active).length;
  return (
    <>
      {header}
      {offCount > 0 && (
        <p className="mb-4 text-sm">
          {showOff ? (
            <Link href="/categories">Hide switched-off categories</Link>
          ) : (
            <Link href="/categories?off=1">
              Show {offCount} switched-off {offCount === 1 ? "category" : "categories"}
            </Link>
          )}
        </p>
      )}
      {groups.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories yet">
          Start by adding a main category.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-testid="categories-tree">
          {groups.map(({ main, subs }) => (
            <div key={main.id} data-testid="category-group">
            <Card className="h-full">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={`/categories/${main.id}`} className="text-lg font-bold">
                  {main.name}
                </Link>
                {!main.active && <StatusBadge word="Switched off" tone="grey" />}
              </p>
              {subs.length === 0 ? (
                <p className="mt-2 text-sm text-icci-ink-60">No sub-categories yet.</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Sub-categories of ${main.name}`}>
                  {subs.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/categories/${s.id}`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-icci-line bg-icci-panel px-3 py-1 text-sm font-semibold text-icci-green no-underline hover:border-icci-green/60"
                      >
                        {s.name}
                        {!s.active && <span className="font-normal text-icci-ink-60">(switched off)</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
