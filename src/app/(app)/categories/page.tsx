// Categories (slice P1.17, tiles added at the owner's request): the main
// categories as tiles with a picture; opening one shows its sub-categories.
// Super Admins and Centre Admins add, rename, move and switch off categories
// from here; nothing is ever deleted.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FolderTree, Plus } from "lucide-react";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryGroups } from "@/lib/categories/rules";
import { createClient } from "@/lib/supabase/server";
import { allCategories, MAY_SEE_CATEGORIES } from "./data";
import { CategoryTile } from "./tile";

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
      subtitle="What kind of thing each item is. Open a main category to see its sub-categories. Every item sits in a sub-category."
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
      <p className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link href="/assets/overview">See how many of each we have</Link>
        {offCount > 0 &&
          (showOff ? (
            <Link href="/categories">Hide switched-off categories</Link>
          ) : (
            <Link href="/categories?off=1">
              Show {offCount} switched-off {offCount === 1 ? "category" : "categories"}
            </Link>
          ))}
      </p>
      {groups.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories yet">
          Start by adding a main category.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="categories-tree" aria-label="Main categories">
          {groups.map(({ main, subs }) => (
            <li key={main.id}>
              <CategoryTile href={`/categories/${main.id}`} icon={main.icon} name={main.name} active={main.active}>
                {subs.length === 0 ? "No sub-categories yet" : `${subs.length} sub-categor${subs.length === 1 ? "y" : "ies"}`}
              </CategoryTile>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
