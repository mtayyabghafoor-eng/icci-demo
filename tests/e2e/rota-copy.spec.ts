// Round D5 in a real browser: "Copy last week's people" puts last week's
// person on the same slot of a week nobody is on yet, by the same database
// rule as one slot. Test weeks are far ahead (2070-2074 on a PC, 2075-2079
// on a phone), each test using two free weeks in a row.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { weekStartOf } from "../../src/lib/rota/week";
import { addDays } from "../../src/lib/vetting/rules";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");

function master() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function freeTwoWeeks(fromYear: number): Promise<string> {
  for (let tries = 0; tries < 50; tries++) {
    const d = new Date(Date.UTC(fromYear, 0, 1) + Math.floor(Math.random() * 5 * 365) * 86_400_000);
    const monday = weekStartOf(d.toISOString().slice(0, 10));
    const { count } = await master().from("rota_weeks").select("id", { count: "exact", head: true }).in("week_start", [monday, addDays(monday, 7)]);
    if (!count) return monday;
  }
  throw new Error("No free test weeks found. Run npm run db:reset.");
}

async function startWeek(page: Page, monday: string) {
  await page.goto(`/rota?week=${monday}`);
  await page.getByRole("button", { name: "Start this week’s rota" }).click();
  await expect(page.locator('[data-testid="rota-slot"]:visible').first()).toBeVisible();
}

test("copy last week's people onto an empty week", async ({ page }, info) => {
  const first = await freeTwoWeeks(info.project.name === "phone" ? 2075 : 2070);
  const next = addDays(first, 7);
  await page.goto(`/rota?week=${first}`);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));

  // Week one: one person on Monday's first slot.
  await startWeek(page, first);
  const slot = page.locator(`[data-testid="rota-slot"][data-date="${first}"]:visible`).first();
  const slotLabel = await slot.getAttribute("aria-label");
  await slot.click();
  const ready = page.getByTestId("picker-person").first();
  const name = (await ready.locator("span.block.font-semibold").first().textContent())!.trim();
  await ready.getByRole("button", { name: /on this slot/ }).click();
  await expect(page.getByText(`${name} is on the slot`).or(page.getByText("The person is on the slot"))).toBeVisible();

  // Week two: started empty; the copy fills the same slot.
  await startWeek(page, next);
  await page.getByRole("button", { name: "Copy last week’s people" }).click();
  await expect(page.getByTestId("notice")).toContainText("Last week's people copied onto 1 slot");
  const sameSlot = page.locator(`[data-testid="rota-slot"][data-date="${next}"]:visible`).first();
  await expect(sameSlot.getByTestId("slot-person")).toHaveText(name);
  expect(slotLabel).toContain("not filled yet");
  await shot(page, "rota-copied", info.project.name, "d5");

  // Someone is on the week now: the button is no longer offered.
  await expect(page.getByRole("button", { name: "Copy last week’s people" })).toHaveCount(0);
});
