"use server";
// What happens when the person forms are sent. Runs on the web server, as
// the signed-in admin: the database's rules decide what is allowed.
import { redirect } from "next/navigation";
import { friendlyPeopleError, parsePersonForm, sameNameAs } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";

export type SameName = { id: string; full_name: string; active: boolean };
export type PersonFormState = { error: string | null; sameName?: SameName[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getter(form: FormData) {
  return (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
}

/** Adds a person (id null) or saves changes to one. */
export async function savePerson(id: string | null, _state: PersonFormState, form: FormData): Promise<PersonFormState> {
  if (id !== null && !UUID.test(id)) return { error: "This person could not be found." };
  const parsed = parsePersonForm(getter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();

  // Two people can share a name, so this is a warning the admin can pass.
  if (form.get("same_name_ok") !== "yes") {
    const { data: similar } = await supabase
      .from("people")
      .select("id, full_name, active")
      .ilike("full_name", parsed.values.full_name.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(20);
    const same = sameNameAs(parsed.values.full_name, (similar ?? []) as SameName[], id ?? undefined);
    if (same.length) return { error: null, sameName: same };
  }

  if (id === null) {
    const { data, error } = await supabase.from("people").insert(parsed.values).select("id").single();
    if (error || !data) return { error: friendlyPeopleError(error?.message) };
    redirect(`/people/${data.id}?done=added`);
  }
  const { data, error } = await supabase.from("people").update(parsed.values).eq("id", id).select("id");
  if (error) return { error: friendlyPeopleError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/people/${id}?done=saved`);
}

/** Switches a person off (they stay on old records) or back on. */
export async function setPersonActive(id: string, active: boolean): Promise<void> {
  if (!UUID.test(id)) redirect("/people");
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").update({ active }).eq("id", id).select("id");
  if (error || !data?.length) redirect(`/people/${id}?done=not-allowed`);
  redirect(`/people/${id}?done=${active ? "switched-on" : "switched-off"}`);
}

/**
 * Links this person to an admin account, or removes the link (account ""),
 * P2.2. The database allows it only for a Super Admin, never on their own
 * account, and one person per account.
 */
export async function setPersonAccount(id: string, form: FormData): Promise<void> {
  if (!UUID.test(id)) redirect("/people");
  const raw = form.get("app_user_id");
  const account = typeof raw === "string" && UUID.test(raw) ? raw : null;
  if (form.get("link") === "yes" && !account) redirect(`/people/${id}?done=pick-account`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").update({ app_user_id: account }).eq("id", id).select("id");
  if (error) {
    const own = /your own account/i.test(error.message);
    redirect(`/people/${id}?done=${own ? "own-account" : "link-refused"}`);
  }
  if (!data?.length) redirect(`/people/${id}?done=not-allowed`);
  redirect(`/people/${id}?done=${account ? "linked" : "unlinked"}`);
}
