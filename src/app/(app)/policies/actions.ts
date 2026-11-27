"use server";
// What happens when the policy forms are sent (slice P2.5). Runs on the web
// server as the signed-in admin: the database's rules decide what is allowed
// (a different admin publishes, a published version never changes, PDFs are
// never replaced, policies are switched off rather than deleted).
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  friendlyPolicyError,
  parsePolicyForm,
  parseVersionForm,
  pdfFrom,
  pickedRoles,
  POLICY_BUCKET,
  policyFilePath,
} from "@/lib/policies/rules";
import { todayInDublin } from "@/lib/vetting/rules";
import { UUID, formGetter } from "@/lib/forms";
import { NOT_FOUND, anyBad, isBool, isUuid } from "@/lib/action-input";

export type PolicyFormState = { error: string | null };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function knownRoles(supabase: Supabase): Promise<Set<string>> {
  const { data } = await supabase.from("person_roles").select("id");
  return new Set((data ?? []).map((r) => r.id as string));
}

/** Makes the switched-on required roles exactly the ones ticked (switching others off, never deleting). */
async function setRequiredRoles(supabase: Supabase, policyId: string, wanted: string[]): Promise<string | null> {
  const { data, error } = await supabase.from("policy_required_roles").select("id, person_role_id, active").eq("policy_id", policyId);
  if (error) return error.message;
  const existing = (data ?? []) as { id: string; person_role_id: string; active: boolean }[];
  const want = new Set(wanted);
  const add = wanted.filter((r) => !existing.some((e) => e.person_role_id === r)).map((person_role_id) => ({ policy_id: policyId, person_role_id }));
  const switchOn = existing.filter((e) => !e.active && want.has(e.person_role_id)).map((e) => e.id);
  const switchOff = existing.filter((e) => e.active && !want.has(e.person_role_id)).map((e) => e.id);
  const results = await Promise.all([
    add.length ? supabase.from("policy_required_roles").insert(add) : null,
    switchOn.length ? supabase.from("policy_required_roles").update({ active: true }).in("id", switchOn) : null,
    switchOff.length ? supabase.from("policy_required_roles").update({ active: false }).in("id", switchOff) : null,
  ]);
  return results.find((r) => r?.error)?.error?.message ?? null;
}

export async function addPolicy(_state: PolicyFormState, form: FormData): Promise<PolicyFormState> {
  const parsed = parsePolicyForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const roles = pickedRoles(form.getAll("roles").map(String), await knownRoles(supabase));
  const { data, error } = await supabase.from("policies").insert(parsed.values).select("id").single();
  if (error) return { error: friendlyPolicyError(error.message) };
  const rolesError = await setRequiredRoles(supabase, data.id, roles);
  if (rolesError) redirect(`/policies/${data.id}?done=roles-refused`);
  redirect(`/policies/${data.id}?done=added`);
}

export async function savePolicy(policyId: string, _state: PolicyFormState, form: FormData): Promise<PolicyFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(policyId))) return { error: NOT_FOUND };
  if (!UUID.test(policyId)) return { error: "This policy could not be found." };
  const parsed = parsePolicyForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("policies").update(parsed.values).eq("id", policyId).select("id");
  if (error) return { error: friendlyPolicyError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/policies/${policyId}?done=saved`);
}

export async function saveRequiredRoles(policyId: string, form: FormData): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(policyId))) notFound();
  if (!UUID.test(policyId)) redirect("/policies");
  const supabase = await createClient();
  const roles = pickedRoles(form.getAll("roles").map(String), await knownRoles(supabase));
  const error = await setRequiredRoles(supabase, policyId, roles);
  redirect(`/policies/${policyId}?done=${error ? "roles-refused" : "roles-saved"}`);
}

export async function setPolicyActive(policyId: string, active: boolean): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(policyId), isBool(active))) notFound();
  if (!UUID.test(policyId)) redirect("/policies");
  const supabase = await createClient();
  const { data, error } = await supabase.from("policies").update({ active }).eq("id", policyId).select("id");
  if (error || !data?.length) redirect(`/policies/${policyId}?done=not-allowed`);
  redirect(`/policies/${policyId}?done=${active ? "switched-on" : "switched-off"}`);
}

/** Saves the PDF as a new file in the policy's folder. Returns its path, or a sentence. */
async function savePdf(supabase: Supabase, policyId: string, pdf: File): Promise<{ path: string } | { error: string }> {
  const path = policyFilePath(policyId);
  const { error } = await supabase.storage.from(POLICY_BUCKET).upload(path, pdf, { contentType: "application/pdf" });
  return error ? { error: "The PDF could not be saved. Please try again." } : { path };
}

export async function uploadVersion(policyId: string, _state: PolicyFormState, form: FormData): Promise<PolicyFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(policyId))) return { error: NOT_FOUND };
  if (!UUID.test(policyId)) return { error: "This policy could not be found." };
  const parsed = parseVersionForm(formGetter(form), todayInDublin());
  if (!parsed.ok) return { error: parsed.error };
  const pdf = await pdfFrom(form);
  if (typeof pdf === "string") return { error: pdf };
  if (!pdf) return { error: "Please choose the PDF of this version." };
  // D7: the Arabic PDF is optional.
  const pdfAr = await pdfFrom(form, "pdf_ar");
  if (typeof pdfAr === "string") return { error: pdfAr };
  const supabase = await createClient();
  const saved = await savePdf(supabase, policyId, pdf);
  if ("error" in saved) return { error: saved.error };
  const savedAr = pdfAr ? await savePdf(supabase, policyId, pdfAr) : null;
  if (savedAr && "error" in savedAr) return { error: savedAr.error };
  const { error } = await supabase
    .from("policy_versions")
    .insert({ policy_id: policyId, ...parsed.values, file_path: saved.path, file_path_ar: savedAr?.path ?? null });
  if (error) return { error: friendlyPolicyError(error.message) };
  redirect(`/policies/${policyId}?done=draft-added`);
}

export async function saveDraft(policyId: string, versionId: string, _state: PolicyFormState, form: FormData): Promise<PolicyFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(policyId), isUuid(versionId))) return { error: NOT_FOUND };
  if (!UUID.test(policyId) || !UUID.test(versionId)) return { error: "This version could not be found." };
  const parsed = parseVersionForm(formGetter(form), todayInDublin());
  if (!parsed.ok) return { error: parsed.error };
  const pdf = await pdfFrom(form);
  if (typeof pdf === "string") return { error: pdf };
  const pdfAr = await pdfFrom(form, "pdf_ar");
  if (typeof pdfAr === "string") return { error: pdfAr };
  const supabase = await createClient();
  const changes: TablesUpdate<"policy_versions"> = { ...parsed.values };
  if (pdf) {
    const saved = await savePdf(supabase, policyId, pdf);
    if ("error" in saved) return { error: saved.error };
    changes.file_path = saved.path;
  }
  if (pdfAr) {
    const savedAr = await savePdf(supabase, policyId, pdfAr);
    if ("error" in savedAr) return { error: savedAr.error };
    changes.file_path_ar = savedAr.path;
  }
  const { data, error } = await supabase.from("policy_versions").update(changes).eq("id", versionId).eq("policy_id", policyId).select("id");
  if (error) return { error: friendlyPolicyError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/policies/${policyId}?done=draft-saved`);
}

export async function publishVersion(policyId: string, versionId: string): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(policyId), isUuid(versionId))) notFound();
  if (!UUID.test(policyId) || !UUID.test(versionId)) redirect("/policies");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policy_versions")
    .update({ status: "published" })
    .eq("id", versionId)
    .eq("policy_id", policyId)
    .select("id");
  if (error) {
    const code = /different admin/i.test(error.message) ? "own-version" : /already passed/i.test(error.message) ? "review-passed" : "publish-refused";
    redirect(`/policies/${policyId}?done=${code}`);
  }
  if (!data?.length) redirect(`/policies/${policyId}?done=not-allowed`);
  redirect(`/policies/${policyId}?done=published`);
}
