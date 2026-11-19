// npm run setup:reminder-key
// Adds a random CRON_SECRET (the daily reminder timer's key) to .env.local
// if there is none yet, then stores its fingerprint in the database named
// in .env.local. It never prints the key. Run again after a database reset
// (the development seed also does this by itself).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { makeReminderKey, storeReminderKey } from "./reminder-key.mts";

const file = ".env.local";
if (!existsSync(file)) {
  console.error("No .env.local yet. Copy .env.example to .env.local first.");
  process.exit(1);
}
const text = readFileSync(file, "utf8");
const line = text.split(/\r?\n/).find((l) => l.startsWith("CRON_SECRET="));
const current = line ? line.slice("CRON_SECRET=".length).trim() : "";
if (current.length > 0 && current.length < 32) {
  console.error("CRON_SECRET in .env.local is too short (32 characters at least). Delete that line and run this again.");
  process.exit(1);
}
if (current === "") {
  const key = makeReminderKey();
  writeFileSync(file, line ? text.replace(line, `CRON_SECRET=${key}`) : `${text.replace(/\s*$/, "")}\nCRON_SECRET=${key}\n`);
  console.log("CRON_SECRET added to .env.local (not shown).");
} else {
  console.log("CRON_SECRET is already in .env.local. Keeping it.");
}

process.loadEnvFile(file);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed in .env.local.");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
await storeReminderKey(admin, process.env.CRON_SECRET!.trim());
console.log("The timer key's fingerprint is stored in the database.");
