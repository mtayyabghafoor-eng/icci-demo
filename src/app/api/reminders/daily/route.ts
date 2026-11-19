// The daily reminder timer's address (slice P2.9). Vercel's timer calls it
// once a morning with "Authorization: Bearer <CRON_SECRET>". Without the
// right key it answers "Not allowed" and does nothing. The database checks
// the key again (by fingerprint) before running anything. It answers with
// counts only, never titles or addresses.
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import { runAndDeliver } from "@/lib/reminders/deliver";
import { bearerKey, sameSecret } from "@/lib/reminders/rules";

export async function GET(request: Request) {
  const key = bearerKey(request.headers.get("authorization"));
  if (!sameSecret(key, process.env.CRON_SECRET)) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  // A visitor who is not signed in: the browser-safe key only, never the master key.
  const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { run, outcomes } = await runAndDeliver(client, key);
    const count = (o: string) => outcomes.filter((x) => x.outcome === o).length;
    return Response.json({
      run_on: run.run_on,
      reminders: run.items.length,
      emails: { sent: count("sent"), recorded_only: count("recorded only"), failed: count("failed") },
    });
  } catch {
    return Response.json({ error: "The reminders could not be run." }, { status: 500 });
  }
}
