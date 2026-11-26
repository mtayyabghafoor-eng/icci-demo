"use server";
// The accounts screen's actions (Round C5). Each one checks what the browser
// handed over first, then asks the database, as the signed-in person,
// whether a Super Admin is asking. Only then is the master key used, and
// only for the sign-in itself (accountsMasterKey, src/lib/supabase/admin.ts).
// Everything else is done as the Super Admin, under the database's rules,
// which also refuse anything done to one's own account.
import { notFound, redirect } from "next/navigation";
import { anyBad, isBool, isUuid } from "@/lib/action-input";
import { friendlyAccountError, parseNewAccount, temporaryPassword } from "@/lib/accounts/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formGetter } from "@/lib/forms";
import { accountsMasterKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** After adding an account or giving a new temporary password, it is shown once, here, never in the address. */
export type AccountFormState = { error: string | null; shown?: { id: string; name: string; email: string; password: string | null } };

const NOT_ALLOWED = "Only a Super Admin can manage accounts.";

/** Add an account: the sign-in (master key), then the account (database rules). */
export async function addAccount(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  const parsed = parseNewAccount(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;
  await requireAdmin();
  const supabase = await createClient();
  const master = await accountsMasterKey(supabase);
  if (!master) return { error: NOT_ALLOWED };

  const byEmail = v.role === "library_operator";
  const password = byEmail ? null : temporaryPassword();
  // A sign-in left half-made earlier (the screen was interrupted) is finished, not made twice.
  const { data: leftOver } = await supabase.rpc("sign_in_without_account", { p_email: v.email });
  let id = typeof leftOver === "string" ? leftOver : null;
  if (id) {
    const fixed = await master.auth.admin.updateUserById(id, byEmail ? { email_confirm: true } : { password: password!, email_confirm: true });
    if (fixed.error) return { error: friendlyAccountError(fixed.error.message) };
  } else {
    const made = await master.auth.admin.createUser({ email: v.email, email_confirm: true, ...(password ? { password } : {}) });
    if (made.error || !made.data.user) return { error: friendlyAccountError(made.error?.message) };
    id = made.data.user.id;
  }
  const { error } = await supabase.rpc("create_account", { p_account: id, p_display_name: v.display_name, p_role: v.role });
  if (error) return { error: friendlyAccountError(error.message) };
  return { error: null, shown: { id, name: v.display_name, email: v.email, password } };
}

/** A new temporary password (forgotten password, or the 24 hours ran out). */
export async function giveTemporaryPassword(accountId: string): Promise<AccountFormState> {
  if (anyBad(isUuid(accountId))) return { error: "This account could not be found." };
  const me = await requireAdmin();
  if (accountId === me.id) return { error: "You cannot do this to your own account. Ask another Super Admin." };
  const supabase = await createClient();
  const master = await accountsMasterKey(supabase);
  if (!master) return { error: NOT_ALLOWED };
  const { data: rows } = await supabase.rpc("account_list");
  const account = ((rows ?? []) as { id: string; display_name: string; email: string; sign_in_method: string }[]).find((a) => a.id === accountId);
  if (!account) return { error: "This account could not be found." };
  if (account.sign_in_method !== "authenticator") return { error: "This account signs in with an emailed code, so it has no password." };

  const password = temporaryPassword();
  const set = await master.auth.admin.updateUserById(accountId, { password });
  if (set.error) return { error: friendlyAccountError(set.error.message) };
  const { error } = await supabase.rpc("note_temporary_password", { p_account: accountId });
  if (error) return { error: friendlyAccountError(error.message) };
  return { error: null, shown: { id: accountId, name: account.display_name, email: account.email, password } };
}

/** Lost phone: remove the authenticator, so it is set up again at the next sign-in. */
export async function resetTwoFactor(accountId: string): Promise<AccountFormState> {
  if (anyBad(isUuid(accountId))) return { error: "This account could not be found." };
  const me = await requireAdmin();
  if (accountId === me.id) return { error: "You cannot do this to your own account. Ask another Super Admin." };
  const supabase = await createClient();
  const master = await accountsMasterKey(supabase);
  if (!master) return { error: NOT_ALLOWED };
  // Written down first; the database refuses here if it is not allowed.
  const { error } = await supabase.rpc("note_two_factor_reset", { p_account: accountId });
  if (error) return { error: friendlyAccountError(error.message) };
  const { data, error: listError } = await master.auth.admin.mfa.listFactors({ userId: accountId });
  if (listError) return { error: friendlyAccountError(listError.message) };
  for (const f of data?.factors ?? []) {
    const gone = await master.auth.admin.mfa.deleteFactor({ id: f.id, userId: accountId });
    if (gone.error) return { error: friendlyAccountError(gone.error.message) };
  }
  redirect(`/accounts/${accountId}?done=two-factor-reset`);
}

/** Switch an account off or back on (never deleted). The database refuses one's own. */
export async function setAccountActive(accountId: string, active: boolean): Promise<void> {
  if (anyBad(isUuid(accountId), isBool(active))) notFound();
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_users").update({ active }).eq("id", accountId).select("id");
  if (error) redirect(`/accounts/${accountId}?done=${/own account/i.test(error.message) ? "own-account" : "not-allowed"}`);
  if (!data?.length) redirect(`/accounts/${accountId}?done=not-allowed`);
  redirect(`/accounts/${accountId}?done=${active ? "switched-on" : "switched-off"}`);
}

/** Link the account to a person in the directory (the same rule as on the person's page, P2.2). */
export async function linkPerson(accountId: string, form: FormData): Promise<void> {
  if (anyBad(isUuid(accountId))) notFound();
  const personId = formGetter(form)("person_id");
  if (!isUuid(personId)) redirect(`/accounts/${accountId}?done=pick-person`);
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").update({ app_user_id: accountId }).eq("id", personId).select("id");
  if (error) redirect(`/accounts/${accountId}?done=${/own account/i.test(error.message) ? "own-account" : "link-refused"}`);
  if (!data?.length) redirect(`/accounts/${accountId}?done=not-allowed`);
  redirect(`/accounts/${accountId}?done=linked`);
}
