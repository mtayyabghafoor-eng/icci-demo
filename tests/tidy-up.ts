// Runs once at the end of the database tests and of the browser tests:
// switches off the made-up "Test run" places and people they created
// (scripts/test-leftovers.mts). Never deletes; development database only.
import { createClient } from "@supabase/supabase-js";
import { switchOffTestLeftovers } from "../scripts/test-leftovers.mts";

export async function tidyUpTestRun(): Promise<void> {
  if (process.env.ICCI_ENVIRONMENT !== "development") return;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const r = await switchOffTestLeftovers(db);
  console.log(
    `Tidy-up: moved ${r.chairsMoved} test chairs to the Test storage room, counted ${r.stockCounted} test stock items to zero, ` +
      `switched off ${r.people} test people, ${r.trainingTypes} test training types, ${r.slotTypes} test rota slot types, ${r.rotaTemplates} test rota templates, ${r.policies} test policies, ${r.vehicles} test vehicles, ${r.renewals} test renewals, ${r.books} test library books, ${r.borrowers} test borrowers, ${r.categories} test categories (cleared ${r.warrantiesCleared} test warranties), ${r.expenseLists} test spend categories and funds, ${r.models} test makes and models, ${r.companies} test companies and ${r.places} test places` +
      (r.placesLeftOn ? ` (${r.placesLeftOn} stay on: a disposal or stocktake is still waiting there).` : "."),
  );
}
