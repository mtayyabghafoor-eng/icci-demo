// Checks a database for leftover test wording ("Test", "Demo", "Example",
// "(made up)", ".test" addresses) after the online demo is refilled (owner,
// 22 Nov 2026: the demo must look real). Reads only; prints counts and examples.
// Run: node --env-file=<settings file> scripts/check-demo-words.mts
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const tables = {
  items: "name, notes", people: "full_name, phone, email", locations: "name", companies: "name, notes", product_models: "model_name, notes",
  maintenance_tickets: "description, reported_by", maintenance_ticket_events: "note", asset_events: "note, reported_by",
  policies: "title", renewals: "title, notes, documents_needed", vehicles: "registration, make_model", library_books: "title, author, publisher",
  library_borrowers: "full_name, contact", rota_templates: "name", training_types: "name", stock_movements: "reason", asset_documents: "title",
};
const bad = /\b(test|demo|example|sample|placeholder|made[ -]?up|madeup|pageturner|bookend)\b|\.test\b|تجريبي/i;
for (const [t, cols] of Object.entries(tables)) {
  const { data, error } = await db.from(t).select(cols).limit(5000);
  if (error) {
    console.log(t, "ERROR", error.message);
    continue;
  }
  const hits: string[] = [];
  for (const r of data) for (const v of Object.values(r)) if (typeof v === "string" && bad.test(v)) hits.push(v);
  console.log(`${t}: ${data.length} rows, ${hits.length} with test words${hits.length ? " e.g. " + JSON.stringify([...new Set(hits)].slice(0, 6)) : ""}`);
}
const { data: users } = await db.auth.admin.listUsers();
console.log("accounts:", users.users.map((u) => (u.user_metadata?.display_name as string | undefined) ?? u.email).join(", "));
