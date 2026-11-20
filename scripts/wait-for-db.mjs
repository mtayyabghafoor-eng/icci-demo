// Waits until the database's web interface answers, after a reset restarts
// it (local Docker or cloud). A fixed pause was sometimes too short
// ("Could not query the database for the schema cache"). Asks every 2
// seconds and needs three good answers in a row (it can answer once and then
// briefly reload); gives up after 2 minutes. Prints no settings.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("wait-for-db: the database address and key are missing from the settings file.");
  process.exit(1);
}
const deadline = Date.now() + 120_000;
let good = 0;
for (let attempt = 1; ; attempt++) {
  try {
    const res = await fetch(`${url}/rest/v1/roles?select=code&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    good = res.ok ? good + 1 : 0;
    if (good === 3) {
      console.log(`Database ready (after ${attempt} tries).`);
      process.exit(0);
    }
  } catch {
    good = 0; // Not answering yet.
  }
  if (Date.now() > deadline) {
    console.error("The database did not answer within 2 minutes.");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
