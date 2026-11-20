// Signs each fictional test account in ONCE per test run and shares the
// sessions with every database test file. Supabase allows only about 30
// sign-ins per 5 minutes, so signing in inside every test would hit that limit.
//
// Each account is kept in two states from the same sign-in:
// - "password only": before the authenticator code (the database must refuse it)
// - full: after the authenticator code (what the website uses)
// The Library Operator accounts sign in with an emailed code instead (slice
// P4.1). Their "full" session is an emailed-code sign-in; the code is asked
// for directly with the master key, so no email is sent.
import { loadTestEnv } from "../test-env";
import { createClient } from "@supabase/supabase-js";
import type { TestProject } from "vitest/node";
import { SEED_ADMINS } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { totp } from "../../scripts/totp.mts";
import { tidyUpTestRun } from "../tidy-up";
import { emailCodeSession } from "./email-code";

import type { TestSession } from "./email-code";
export type { TestSession };

declare module "vitest" {
  export interface ProvidedContext {
    sessions: Record<string, TestSession>;
    passwordOnlySessions: Record<string, TestSession>;
    /** Password and authenticator, for every account (operators included). */
    authenticatorSessions: Record<string, TestSession>;
  }
}

export default async function setup(project: TestProject) {
  loadTestEnv(); // local Docker database by default (tests/test-env.ts)
  if (process.env.ICCI_ENVIRONMENT !== "development") {
    throw new Error('Database tests only run against the development database (ICCI_ENVIRONMENT="development").');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const sessions: Record<string, TestSession> = {};
  const passwordOnlySessions: Record<string, TestSession> = {};
  const authenticatorSessions: Record<string, TestSession> = {};
  for (const person of SEED_ADMINS) {
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({
      email: person.email,
      password: process.env.TEST_USER_PASSWORD!,
    });
    if (error || !data.session) {
      throw new Error(`Could not sign in as ${person.email}: ${error?.message}. Has "npm run db:seed" been run?`);
    }
    passwordOnlySessions[person.email] = {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      userId: data.user.id,
    };

    const { data: factors } = await client.auth.mfa.listFactors();
    const factor = factors?.totp[0];
    if (!factor) throw new Error(`${person.email} has no authenticator. Run "npm run db:seed".`);
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totp(testAuthenticatorSecret(person.email)),
    });
    if (verified.error) throw new Error(`Authenticator code refused for ${person.email}: ${verified.error.message}`);
    authenticatorSessions[person.email] = {
      accessToken: verified.data.access_token,
      refreshToken: verified.data.refresh_token,
      userId: data.user.id,
    };
    sessions[person.email] =
      person.role === "library_operator" ? await emailCodeSession(url, key, person.email) : authenticatorSessions[person.email];
  }
  project.provide("sessions", sessions);
  project.provide("passwordOnlySessions", passwordOnlySessions);
  project.provide("authenticatorSessions", authenticatorSessions);

  // After all database tests: switch off the test records they made.
  return tidyUpTestRun;
}

