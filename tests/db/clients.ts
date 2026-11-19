import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import { requireEnv } from "@/lib/env";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { emailCodeSession } from "./email-code";

const options = { auth: { autoRefreshToken: false, persistSession: false } };

/** A visitor who is not signed in (holds only the public, browser-safe key). */
export function signedOutClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    options,
  );
}

/**
 * The master key, which skips the row-level security rules. Used only to
 * prove that some rules (no deleting, audit log cannot be changed) hold even
 * against it. Never used by the website.
 */
export function masterKeyClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), options);
}

/** The database id of a fictional seed account. */
export function userIdOf(email: string): string {
  const s = inject("sessions")[email];
  if (!s) throw new Error(`No test session for ${email}`);
  return s.userId;
}

/** A client signed in as one of the fictional seed admins (signed in once per run). */
export async function signedInClient(email: string): Promise<SupabaseClient> {
  const s = inject("sessions")[email];
  if (!s) throw new Error(`No test session for ${email}`);
  const client = signedOutClient();
  const { error } = await client.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken });
  if (error) throw new Error(`Could not restore session for ${email}: ${error.message}`);
  return client;
}

/**
 * A client signed in with the password only, before the authenticator code.
 * The database must treat it as having no access at all.
 */
export async function passwordOnlyClient(email: string): Promise<SupabaseClient> {
  const s = inject("passwordOnlySessions")[email];
  if (!s) throw new Error(`No password-only test session for ${email}`);
  const client = signedOutClient();
  const { error } = await client.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken });
  if (error) throw new Error(`Could not restore password-only session for ${email}: ${error.message}`);
  return client;
}

/**
 * Signed in with password AND authenticator code, for any account. For the
 * Library Operator this is the wrong way to sign in: the database must
 * refuse it (slice P4.1).
 */
export async function authenticatorClient(email: string): Promise<SupabaseClient> {
  const s = inject("authenticatorSessions")[email];
  if (!s) throw new Error(`No authenticator test session for ${email}`);
  const client = signedOutClient();
  const { error } = await client.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken });
  if (error) throw new Error(`Could not restore authenticator session for ${email}: ${error.message}`);
  return client;
}

/** A brand-new emailed-code sign-in for any account (no email is sent). */
export async function emailCodeClient(email: string): Promise<SupabaseClient> {
  const s = await emailCodeSession(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), email);
  const client = signedOutClient();
  const { error } = await client.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken });
  if (error) throw new Error(`Could not restore emailed-code session for ${email}: ${error.message}`);
  return client;
}

/** Signed-in client for the first seed account with this role. */
export function asRole(role: string, active = true) {
  return signedInClient(seedAdmin(role, active).email);
}

/** A unique, obviously fictional name for records created by a test run. */
export function testName(label: string) {
  return `Test run ${new Date().toISOString()} ${Math.random().toString(36).slice(2, 7)} ${label}`;
}
