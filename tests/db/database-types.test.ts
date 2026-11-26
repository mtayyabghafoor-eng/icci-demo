// Round C4: the code's exact description of the database
// (src/lib/supabase/database.types.ts) must match the database itself. If
// this fails after a new migration, run "npm run db:types" and commit the file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeDbTypes, TYPES_FILE } from "../../scripts/db-types.mjs";

describe("the code's description of the database", () => {
  it("is up to date with every migration", () => {
    const current = readFileSync(TYPES_FILE, "utf8").replace(/\r\n/g, "\n");
    expect(current === makeDbTypes(), 'Out of date: run "npm run db:types".').toBe(true);
  }, 120_000);
});
