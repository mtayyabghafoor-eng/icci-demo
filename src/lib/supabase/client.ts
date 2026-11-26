import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** Database connection for code running in the admin's browser. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
