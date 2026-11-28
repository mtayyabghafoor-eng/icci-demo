// Slice E4 in a real browser, on a PC-sized and a phone-sized window: the
// Save bar. On a phone, Save (with Cancel beside it) is in view without
// scrolling and never sits under the bottom bar; Dispose has Cancel; the
// saved message keeps off the page title. Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function signInAt(page: Page, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

/** On a phone the Save bar is on screen without scrolling, and ends above the bottom bar. */
async function expectSaveInReach(page: Page) {
  const bar = page.getByTestId("save-bar").filter({ visible: true }).first();
  // A PC shows the bar where it always was, at the end of the form.
  if (!isPhone(page)) return expect(bar.getByRole("button").first()).toBeVisible();
  await expect(bar).toBeInViewport();
  await expect(bar.getByRole("button").first()).toBeInViewport();
  {
    const barBox = (await bar.boundingBox())!;
    const bottom = (await page.getByTestId("bottom-bar").boundingBox())!;
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(bottom.y + 1);
  }
}

test("Record vetting: Save and Cancel are in reach without scrolling", async ({ page }, info) => {
  const { data } = await master().from("people").select("id").eq("active", true).ilike("full_name", "Test %").limit(1).single();
  await signInAt(page, `/people/${data!.id}/vetting`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectSaveInReach(page);
  await expect(page.getByTestId("save-bar").getByRole("link", { name: "Cancel" })).toHaveAttribute("href", `/people/${data!.id}`);
  await shot(page, "record-vetting", info.project.name, "e4");
});

test("Register a person, Report a problem and Dispose all have Save in reach and Cancel", async ({ page }, info) => {
  const { data: item } = await master().from("items").select("id").eq("kind", "fixed_asset").eq("condition", "good").ilike("name", "Test %").limit(1).single();
  await signInAt(page, "/people/new");
  await expectSaveInReach(page);
  await expect(page.getByTestId("save-bar").getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/people");

  await page.goto(`/items/${item!.id}/asset/dispose`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectSaveInReach(page);
  await expect(page.getByTestId("save-bar").getByRole("link", { name: "Cancel" })).toHaveAttribute("href", `/items/${item!.id}`);
  await shot(page, "dispose", info.project.name, "e4");

  await page.goto("/tickets/new");
  await expectSaveInReach(page);
});

test("a saved message never covers the page title", async ({ page }) => {
  await signInAt(page, "/rota");
  await page.goto("/rota?done=assigned");
  const toast = page.getByTestId("toast");
  await expect(toast).toBeVisible();
  const t = (await toast.boundingBox())!;
  const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  const overlaps = t.x < title.x + title.width && title.x < t.x + t.width && t.y < title.y + title.height && title.y < t.y + t.height;
  expect(overlaps).toBe(false);
  // On a phone it sits just above the bottom bar, never over it.
  if (isPhone(page)) {
    const bottom = (await page.getByTestId("bottom-bar").boundingBox())!;
    expect(t.y + t.height).toBeLessThanOrEqual(bottom.y + 1);
    expect(t.y).toBeGreaterThan(title.y + title.height);
  }
});
