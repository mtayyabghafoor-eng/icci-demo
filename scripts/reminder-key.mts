// The daily reminder timer's secret key (slice P2.9). The key itself lives
// in .env.local (and, when the site is online, in the web host's settings
// as CRON_SECRET). The database keeps only its fingerprint (SHA-256), so a
// copy of the database never reveals the key. Never printed.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const makeReminderKey = () => randomBytes(32).toString("hex");

export const reminderKeyFingerprint = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

/** Stores the fingerprint. Needs the master key (this PC only). */
export async function storeReminderKey(admin: SupabaseClient, key: string): Promise<void> {
  const { error } = await admin.rpc("set_reminder_timer_key", { p_key_hash: reminderKeyFingerprint(key) });
  if (error) throw new Error(`Could not store the reminder timer key. Has migration 0027 been applied? ${error.message}`);
}
