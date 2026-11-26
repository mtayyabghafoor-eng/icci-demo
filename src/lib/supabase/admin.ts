// Round C5 (owner's choice A, 26 Nov 2026): the master key on the website's
// server, for exactly three things the database cannot do itself: making a
// sign-in, setting a temporary password, and removing a lost authenticator.
//
// Rules, kept in this one file:
//   * Only the accounts screen's actions use it (src/app/(app)/accounts/actions.ts).
//   * They first ask the database, as the signed-in person, whether a
//     Super Admin is asking (may_manage_accounts); otherwise it is never made.
//   * It is never used to read or change the Centre's records: those always
//     go through the signed-in person's own connection and the database rules.
//   * The key lives only in the web host's settings (SUPABASE_SECRET_KEY,
//     never NEXT_PUBLIC_), so it can never reach a browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

type Asker = { rpc: (fn: "may_manage_accounts") => PromiseLike<{ data: unknown; error: unknown }> };

/** The master key connection, only for a confirmed Super Admin. Null otherwise. */
export async function accountsMasterKey(asker: Asker): Promise<SupabaseClient | null> {
  const { data, error } = await asker.rpc("may_manage_accounts");
  if (error || data !== true) return null;
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
