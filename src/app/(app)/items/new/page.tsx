import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { locationOptions, parseLabelNumber } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../data";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register an item | ICCI Control Dashboard" };

export default function RegisterPage(props: PageProps<"/items/new">) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Register an Item</h1>
      <Suspense fallback={<p className="mt-4">Loading…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/items/new">["searchParams"] }) {
  const params = await searchParams;
  const label = parseLabelNumber(typeof params.label === "string" ? params.label : "") ?? "";
  const supabase = await createClient();

  // A label that is already on an item opens that item instead.
  if (label) {
    const { data: existing } = await supabase.from("items").select("id").eq("label_serial", label).maybeSingle();
    if (existing) redirect(`/items/${existing.id}`);
  }

  const { categories, locations } = await loadLookups(supabase);
  return (
    <>
      <p className="mt-2">
        {label ? (
          <>
            Label <strong>{label}</strong> is not on any item yet.{" "}
            <span className="block text-sm">
              Is this label for a library book? <Link href={`/library/new?label=${label}`}>Add a book instead</Link>.
            </span>
          </>
        ) : (
          "Scan a label with your phone camera, or type its number below."
        )}
      </p>
      <RegisterForm
        label={label}
        categories={categories.filter((c) => c.active)}
        allPlaces={locationOptions(locations)}
        stockPlaces={locationOptions(locations, ["store_room", "shelf"])}
        place={typeof params.location === "string" ? params.location : undefined}
      />
    </>
  );
}
