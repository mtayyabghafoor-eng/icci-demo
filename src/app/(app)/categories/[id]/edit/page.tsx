// Rename a category (slice P1.17); a sub-category can also move to another
// main category. Its record number never changes, so its items and history
// stay with it.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { compareCategoryNames } from "@/lib/categories/rules";
import { createClient } from "@/lib/supabase/server";
import { allCategories, MAY_SEE_CATEGORIES, UUID } from "../../data";
import { allCompanies, companyChoices } from "../../../companies/data";
import { keeperChoices } from "../../../vehicles/data";
import { CategoryForm } from "../../forms";

export const metadata: Metadata = { title: "Rename a category | ICCI Control Dashboard" };

export default function EditCategoryPage(props: PageProps<"/categories/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/categories/[id]/edit">["params"] }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const all = await allCategories(supabase);
  const category = all.find((c) => c.id === id);
  if (!category) notFound();
  const main = category.parent_id ? all.find((c) => c.id === category.parent_id) : undefined;
  const isSub = Boolean(category.parent_id);
  // A sub-category may move to any switched-on main category (or stay where it is).
  const mains = all
    .filter((c) => c.parent_id === null && (c.active || c.id === category.parent_id))
    .sort((a, b) => compareCategoryNames(a.name, b.name));
  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/categories", label: "Categories" },
          ...(main ? [{ href: `/categories/${main.id}`, label: main.name }] : []),
          { href: `/categories/${id}`, label: category.name },
        ]}
        title={isSub ? "Change This Sub-category" : "Change This Main Category"}
        subtitle="Items keep their category: only the name they are filed under changes."
      />
      <CategoryForm
        category={category}
        isSub={isSub}
        mains={isSub ? mains : undefined}
        companies={companyChoices(await allCompanies(supabase), category.service_company_id)}
        people={await keeperChoices(supabase, category.contact_person_id)}
        cancelHref={`/categories/${id}`}
      />
    </>
  );
}
