// Add a category (slice P1.17): a main category, or ?inside=<main category>
// for a sub-category inside it.
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";
import { allCategories, MAY_SEE_CATEGORIES, UUID } from "../data";
import { CategoryForm } from "../forms";

export const metadata: Metadata = { title: "Add a category | ICCI Control Dashboard" };

export default function NewCategoryPage(props: PageProps<"/categories/new">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/categories/new">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode)) {
    return <p data-testid="categories-not-allowed">Your account cannot add categories. Only a Super Admin or Centre Admin can.</p>;
  }
  const inside = (await searchParams).inside;
  const parentId = typeof inside === "string" && UUID.test(inside) ? inside : null;
  const crumbs = [{ href: "/categories", label: "Categories" }];
  if (!parentId) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Add a Main Category" subtitle="A broad group. Add its sub-categories next, including an “Other …” one." />
        <CategoryForm isSub={false} cancelHref="/categories" />
      </>
    );
  }
  const parent = (await allCategories(await createClient())).find((c) => c.id === parentId);
  if (!parent || parent.parent_id !== null || !parent.active) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Add a Sub-category" />
        <p>Nothing can be added there. Sub-categories go inside a main category that is switched on.</p>
      </>
    );
  }
  return (
    <>
      <PageHeader crumbs={[...crumbs, { href: `/categories/${parent.id}`, label: parent.name }]} title="Add a Sub-category" subtitle={`Inside ${parent.name}`} />
      <CategoryForm parentId={parent.id} isSub cancelHref={`/categories/${parent.id}`} />
    </>
  );
}
