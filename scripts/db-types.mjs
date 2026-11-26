// Round C4 (owner's yes to question 8, 25 Nov 2026): the code is given an
// exact description of the database, so a misspelt table or column name is
// caught by the type check before anything runs.
//
// "npm run db:types" asks the local test database (after "npm run db:reset")
// for its description and writes src/lib/supabase/database.types.ts.
// tests/db/database-types.test.ts fails if the file is out of date.
//
// Two adjustments, because the generator cannot see them:
//   * Database functions here accept an empty value (null) for any input;
//     each function decides itself what is required.
//   * Some columns are filled in by the database (for example a status set
//     by a trigger), so no column is required when adding a row. A missing
//     one is still refused by the database itself.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TYPES_FILE = "src/lib/supabase/database.types.ts";

const HEADER = [
  "// The exact description of the database (Round C4). Made by",
  '// "npm run db:types" (scripts/db-types.mjs) from the local test database',
  "// after a reset. Never edited by hand: run the command again after each",
  "// new migration.",
  "",
].join("\n");

/** The generator's output with the two adjustments above. */
export function adjust(generated) {
  const lines = generated.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^\s*Insert: \{\s*$/.test(lines[i - 1] ?? "")) {
      // "name": type  ->  "name"?: type
      line = line.replace(/"([a-z0-9_]+)": /g, '"$1"?: ');
    }
    line = line.replace(/\{ Args: \{ (.*?) \}; Returns:/, (_, args) => {
      const each = args.split(/,(?=")/).map((a) => (/\| null$/.test(a) ? a : `${a} | null`));
      return `{ Args: { ${each.join(",")} }; Returns:`;
    });
    out.push(line);
  }
  return HEADER + out.join("\n").trimEnd() + "\n";
}

/** Asks the local test database for its description (Docker must be running). */
export function makeDbTypes() {
  // A fixed command, nothing from outside in it.
  const generated = execSync("npx supabase gen types typescript --local --schema public", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return adjust(generated);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(TYPES_FILE, makeDbTypes());
  console.log(`Wrote ${TYPES_FILE}.`);
}
