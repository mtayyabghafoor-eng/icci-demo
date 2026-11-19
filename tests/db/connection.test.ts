import { describe, expect, it } from "vitest";
import { requireEnv } from "@/lib/env";
import { SEED_ADMINS } from "../../scripts/seed-data.mts";
import { signedInClient, signedOutClient } from "./clients";

describe("development database connection", () => {
  it("the database can be reached with the public key", async () => {
    const res = await fetch(`${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/health`, {
      headers: { apikey: requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") },
    });
    expect(res.status).toBe(200);
  });
});

describe("signed-out visitor", () => {
  it("cannot list user accounts", async () => {
    const { data, error } = await signedOutClient().auth.admin.listUsers();
    expect(error).not.toBeNull();
    expect(data.users).toHaveLength(0);
  });

  it("cannot sign in with a wrong password", async () => {
    const { data, error } = await signedOutClient().auth.signInWithPassword({
      email: SEED_ADMINS[0].email,
      password: "definitely-not-the-password",
    });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });
});

describe("seeded fictional admins", () => {
  for (const person of SEED_ADMINS) {
    it(`${person.displayName} can sign in`, async () => {
      const client = await signedInClient(person.email);
      const { data } = await client.auth.getUser();
      expect(data.user?.email).toBe(person.email);
    });

    it(`${person.displayName} cannot list other user accounts`, async () => {
      const client = await signedInClient(person.email);
      const { error } = await client.auth.admin.listUsers();
      expect(error).not.toBeNull();
    });
  }
});
