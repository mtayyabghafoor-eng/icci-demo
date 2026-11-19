// Add a person (slice P2.1). Designed for a PC first.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_PEOPLE } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeePeople } from "../cannot-see";
import { loadPeopleLists } from "../data";
import { PersonForm } from "../person-form";

export const metadata: Metadata = { title: "Add a person | ICCI Control Dashboard" };

export default function NewPersonPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <p className="text-sm">
        <Link className="back-link" href="/people">← People</Link>
      </p>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Add a Person</h1>
      <Suspense fallback={<p className="mt-4">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSeePeople />;
  const { roles, sections } = await loadPeopleLists(await createClient());
  return <PersonForm person={null} roles={roles.filter((r) => r.active)} sections={sections.filter((s) => s.active)} />;
}
