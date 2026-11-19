"use server";
// What happens when the sign-off forms are sent (slice P2.6). Runs on the web
// server as the signed-in admin: the database's rules decide what is allowed
// (never your own sign-off, only published versions, no future dates or dates
// before approval, withdraw with a reason, never delete).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlySignoffError, parseSignoffForm, SCAN_BUCKET, scanFrom, scanPath } from "@/lib/policies/signoffs";
import { parseWithdrawReason, todayInDublin } from "@/lib/vetting/rules";

export type SignoffFormState = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getter(form: FormData) {
  return (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
}

/** One signed sheet: the same date (and scan) for every person ticked, saved together or not at all. */
export async function recordSignoffs(policyId: string, versionId: string, _state: SignoffFormState, form: FormData): Promise<SignoffFormState> {
  if (!UUID.test(policyId) || !UUID.test(versionId)) return { error: "This policy could not be found." };
  const supabase = await createClient();
  const { data: version } = await supabase.from("policy_versions").select("approved_on").eq("id", versionId).eq("policy_id", policyId).maybeSingle();
  if (!version) return { error: "This version could not be found." };
  const parsed = parseSignoffForm(getter(form), form.getAll("people").map(String), todayInDublin(), version.approved_on);
  if (!parsed.ok) return { error: parsed.error };
  const scan = scanFrom(form);
  if (typeof scan === "string") return { error: scan };

  let scan_path: string | null = null;
  if (scan) {
    scan_path = scanPath(versionId, scan.ext);
    const up = await supabase.storage.from(SCAN_BUCKET).upload(scan_path, scan.file, { contentType: scan.file.type });
    if (up.error) return { error: "The scan could not be saved. Please try again, or save without a scan." };
  }
  const { error } = await supabase
    .from("policy_signoffs")
    .insert(parsed.values.people.map((person_id) => ({ person_id, policy_version_id: versionId, signed_on: parsed.values.signed_on, scan_path })));
  if (error) return { error: friendlySignoffError(error.message) };
  const n = parsed.values.people.length;
  redirect(`/policies/${policyId}?done=signed&n=${n}`);
}

export async function withdrawSignoff(policyId: string, signoffId: number, form: FormData): Promise<void> {
  if (!UUID.test(policyId) || !Number.isSafeInteger(signoffId)) redirect("/policies");
  const reason = parseWithdrawReason(getter(form)("reason"));
  if (!reason.ok) redirect(`/policies/${policyId}?done=withdraw-reason`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("policy_signoffs").update({ withdrawn_reason: reason.values }).eq("id", signoffId).select("id");
  if (error) redirect(`/policies/${policyId}?done=${/your own/i.test(error.message) ? "own-signoff" : "withdraw-refused"}`);
  if (!data?.length) redirect(`/policies/${policyId}?done=not-allowed`);
  redirect(`/policies/${policyId}?done=signoff-withdrawn`);
}
