// Edit a person's details (slice P2.1). Designed for a PC first.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_PEOPLE } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeePeople } from "../../cannot-see";
import { loadPeopleLists, PERSON_COLUMNS, type PersonRow } from "../../data";
import { PersonForm } from "../../person-form";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Edit person | ICCI Control Dashboard" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditPersonPage(props: PageProps<"/people/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/people/[id]/edit">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSeePeople />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("people").select(PERSON_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const person = data as PersonRow;
  const { roles, sections } = await loadPeopleLists(supabase);

  return (
    <>
      <BackLink href={`/people/${id}`}>Back to {person.full_name}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Edit Person</h1>
      <p className="mt-2 text-sm">The old details are kept in the audit log.</p>
      <PersonForm
        person={person}
        // A switched-off role or section stays possible only for someone who already has it.
        roles={roles.filter((r) => r.active || r.id === person.person_role_id)}
        sections={sections.filter((s) => s.active || s.id === person.section_id)}
      />
    </>
  );
}
