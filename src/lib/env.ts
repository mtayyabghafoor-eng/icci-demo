/**
 * Reads a required setting. Fails loudly, naming the setting but never
 * printing its value, so a missing key is obvious and a secret never leaks.
 */
export function requireEnv(name: string, value: string | undefined = process.env[name]): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing setting ${name}. Add it to .env.local (see .env.example).`);
  }
  return value.trim();
}

/** Only the development database may ever be reset. */
export function assertDevelopment(environment: string | undefined): void {
  if (environment !== "development") {
    throw new Error(
      'Refusing to run: ICCI_ENVIRONMENT must be "development". ' +
        "Resetting is never allowed on staging or production.",
    );
  }
}

/**
 * The made-up data may be added to the development database and to the
 * staging (demo) database, never to production (owner's decision, session 28).
 * Adding only: resetting staging stays refused by assertDevelopment.
 */
export function assertSeedable(environment: string | undefined): "development" | "staging" {
  if (environment === "development" || environment === "staging") return environment;
  throw new Error(
    'Refusing to seed: ICCI_ENVIRONMENT must be "development" or "staging". ' +
      "Made-up data is never added to production.",
  );
}

/** The ICCI Staging (demo) project. Its reference is part of its web address, not a secret. */
export const STAGING_PROJECT_REF = "hqauynjxtdafxhgzmffq";

/**
 * The staging re-seed (npm run db:seed:staging) may only ever fill the ICCI
 * Staging project, and only when its settings file says "staging". Any other
 * database, the development one included, is refused before anything runs.
 */
export function assertStagingTarget(environment: string | undefined, url: string | undefined): void {
  if (environment !== "staging") {
    throw new Error('Refusing to seed the demo: ICCI_ENVIRONMENT must be "staging" in .env.staging.');
  }
  let host = "";
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    host = "";
  }
  if (host !== `${STAGING_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing to seed the demo: the address in .env.staging is not the ICCI Staging project.");
  }
}

/** The "Demo: all names and records are made up" strip shows on the online demo only. */
export function showDemoBanner(environment: string | undefined): boolean {
  return environment === "staging";
}
