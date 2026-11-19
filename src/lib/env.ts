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
