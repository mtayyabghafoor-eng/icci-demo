// Speed and reliability of every main page (owner's request, 22 Nov 2026).
// Signs in as the Centre Admin once, then opens each page three times and
// records how long the page took (until its main heading shows) and any
// browser errors. A page over 3 seconds (median) or with an error fails.
import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage } from "../e2e/helpers";

const centre = seedAdmin("centre_admin");
const LIMIT_MS = 3000;

async function ids() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const [item, garden, ticket, company, model, person, policy, place] = await Promise.all([
    db.from("items").select("id").eq("name", "Test lawnmower 02").single(),
    db.from("item_categories").select("id").eq("name", "Garden, tools and cleaning equipment").single(),
    db.from("maintenance_tickets").select("id").order("id").limit(1).single(),
    db.from("companies").select("id").eq("name", "Example Garden Machines Ltd").single(),
    db.from("product_models").select("id").eq("model_name", "Mow 46").single(),
    db.from("people").select("id").eq("active", true).limit(1).single(),
    db.from("policies").select("id").limit(1).single(),
    db.from("locations").select("id").eq("name", "Test Building A").single(),
  ]);
  const [room, bulkChair] = await Promise.all([
    db.from("locations").select("id").eq("name", "Test Room A1").single(),
    db.from("items").select("id").eq("name", "Test bulk chair 0001").maybeSingle(),
  ]);
  return {
    item: item.data!.id,
    garden: garden.data!.id,
    ticket: ticket.data!.id,
    company: company.data!.id,
    model: model.data!.id,
    person: person.data!.id,
    policy: policy.data!.id,
    place: place.data!.id,
    room: room.data!.id,
    bulkChair: bulkChair.data?.id as string | undefined,
  };
}

test("every main page opens quickly, three times over, with no browser errors", async ({ page }, info) => {
  const id = await ids();
  const pages: [string, string][] = [
    ["Home", "/"],
    ["Items", "/items"],
    ["Items search: lawnmower", "/items?q=lawnmower"],
    ["Item page (with If this goes wrong)", `/items/${id.item}`],
    ["What we own", "/assets/overview"],
    ["What we own: one building", `/assets/overview?place=${id.place}`],
    ["Categories", "/categories"],
    ["A main category", `/categories/${id.garden}`],
    ["Call sheet", "/categories/call-sheet"],
    ["Companies", "/companies"],
    ["A company", `/companies/${id.company}`],
    ["Makes and models", "/models"],
    ["A model (with manual)", `/models/${id.model}`],
    ["Tickets", "/tickets"],
    ["A ticket", `/tickets/${id.ticket}`],
    ["Report a problem", `/tickets/new?item=${id.item}`],
    ["Places", "/places"],
    ["Stock", "/stock"],
    ["Stocktake", "/stocktake"],
    ["Missing and damaged", "/assets"],
    ["Asset register", "/assets/register"],
    ["Not seen in 12 months", "/assets/not-seen"],
    ["People", "/people"],
    ["A person", `/people/${id.person}`],
    ["Garda vetting", "/people/vetting"],
    ["Policies", "/policies"],
    ["A policy", `/policies/${id.policy}`],
    ["Policy grid", "/policies/grid"],
    ["Vehicles", "/vehicles"],
    ["Renewals", "/renewals"],
    ["Rota week", "/rota"],
    ["Library overview", "/library/overview"],
    ["Library desk", "/library"],
    // Round C2: lists that read one page at a time, deep into the list.
    ["Training", "/people/training"],
    ["Tickets, page 20", "/tickets?page=20"],
    ["People, page 20", "/people?page=20"],
    ["Asset register: one room", `/assets/register?place=${id.room}`],
  ];
  // Round C2: with the bulk made-up data (npm run db:load-many), the chair
  // with 1,200 changes in its history.
  if (id.bulkChair) pages.push(["Item with 1,200 changes", `/items/${id.bulkChair}`]);

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`);
  });

  await page.goto("/");
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));

  const results: { page: string; path: string; runsMs: number[]; medianMs: number; errors: string[] }[] = [];
  for (const [name, path] of pages) {
    const runs: number[] = [];
    const before = errors.length;
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      const res = await page.goto(path);
      expect(res?.status(), `${name} answered`).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      // Wait for the page's own loading lines ("Loading…") to finish.
      await expect(page.getByText(/^Loading/).filter({ visible: true })).toHaveCount(0);
      runs.push(Date.now() - start);
    }
    const sorted = [...runs].sort((a, b) => a - b);
    results.push({ page: name, path, runsMs: runs, medianMs: sorted[1], errors: errors.slice(before) });
  }

  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/speed-${info.project.name}.json`, JSON.stringify(results, null, 2));
  console.log(`\n${info.project.name}: page, median ms (3 runs)`);
  for (const r of results) console.log(`${r.medianMs > LIMIT_MS ? "SLOW " : "     "}${String(r.medianMs).padStart(5)}  ${r.page}${r.errors.length ? `  ERRORS: ${r.errors.length}` : ""}`);

  const slow = results.filter((r) => r.medianMs > LIMIT_MS).map((r) => `${r.page} ${r.medianMs} ms`);
  expect(slow, "pages slower than 3 seconds").toEqual([]);
  expect(errors, "browser errors").toEqual([]);
});
