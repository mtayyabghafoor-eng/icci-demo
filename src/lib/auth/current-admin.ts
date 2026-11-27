import { redirect } from "next/navigation";
import { cache } from "react";
import { assuranceOf } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";

export type CurrentAdmin = {
  id: string;
  displayName: string;
  roleCode: string;
  roleLabel: string;
  /** The server's clock when the page was made (used by the idle timer). */
  serverNow: number;
};

/**
 * The signed-in admin, for every signed-in page. A second check behind the
 * gatekeeper: if the database will not show this person their own account
 * (no authenticator code, the wrong way of signing in for their role,
 * switched off, or no access), they are sent away.
 */
export const requireAdmin = cache(checkAdmin);

/**
 * E5: the check itself. requireAdmin (above) runs it once per page, however
 * many parts of the page ask (the frame and the page used to check twice).
 * React forgets the answer when the page is sent, so the next page and
 * every other visitor are checked afresh.
 */
async function checkAdmin(): Promise<CurrentAdmin> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims.sub;
  if (!id) redirect("/sign-in");
  // Password only: the authenticator code is still needed. An emailed code
  // (Library Operator) goes on to the database check below.
  if (assuranceOf(claims.claims) === "aal1") redirect("/sign-in/code");

  const ownAccount = () => supabase.from("app_users").select("id, display_name, role, roles(label)").eq("id", id).maybeSingle();
  let { data, error } = await ownAccount();
  // A6: the database did not answer (a moment's hiccup, not a refusal). Ask
  // once more; if it still does not answer, show "Try again" (error.tsx)
  // instead of signing the admin out.
  if (error) {
    await new Promise((r) => setTimeout(r, 300));
    ({ data, error } = await ownAccount());
    if (error) throw new Error("The sign-in could not be checked: the database did not answer.");
  }
  // The database answered but will not show this account: no access. The
  // sign-in is still valid, so it must be ended before showing sign-in.
  if (!data) redirect("/sign-out?reason=no-access");

  const role = data.roles as unknown as { label: string } | null;
  return {
    id: data.id,
    displayName: data.display_name,
    roleCode: data.role,
    roleLabel: role?.label ?? data.role,
    serverNow: Date.now(),
  };
}
