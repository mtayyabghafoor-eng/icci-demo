import { redirect } from "next/navigation";
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
export async function requireAdmin(): Promise<CurrentAdmin> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims.sub;
  if (!id) redirect("/sign-in");
  // Password only: the authenticator code is still needed. An emailed code
  // (Library Operator) goes on to the database check below.
  if (assuranceOf(claims.claims) === "aal1") redirect("/sign-in/code");

  const { data } = await supabase
    .from("app_users")
    .select("id, display_name, role, roles(label)")
    .eq("id", id)
    .maybeSingle();
  // The sign-in is still valid, so it must be ended before showing sign-in.
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
