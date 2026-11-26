import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Database connection for code running on the web server. It acts as the
 * signed-in admin (read from their cookies), so row-level security applies.
 * The secret key is never used here.
 */
export async function createClient() {
  // Anything that uses the sign-in is worked out when the page is asked
  // for, never drawn in advance.
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a page render, where cookies are read-only.
            // The gatekeeper (src/proxy.ts) refreshes the sign-in instead.
          }
        },
      },
    },
  );
}
