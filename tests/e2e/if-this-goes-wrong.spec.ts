// Slices P1.19 to P1.21 in a real browser, on a PC-sized and a phone-sized
// window, with made-up data only: a broken lawnmower shows who to call, its
// warranty and its manual on the item, report and ticket pages; the ticket is
// passed to a company with their job number; companies and makes and models
// are added; a manual is uploaded and a wrong one hidden; the staff call
// sheet prints. Finance sees none of it. Screens saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, mainMenu, shot, showFilters, applyFilters, openTicketMore } from "./helpers";

const centre = seedAdmin("centre_admin");
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p1-21");
const master = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const PDF = Buffer.from("%PDF-1.4\n% Test: made-up placeholder manual\n%%EOF\n");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("a broken lawnmower: who to call, warranty and manual; report it; pass it to the company", async ({ page }, info) => {
  const project = info.project.name;
  const { data: mower } = await master().from("items").select("id").eq("name", "Test lawnmower 02").single();

  await signInAs(page, centre, `/items/${mower!.id}`);
  const card = page.getByTestId("contact-card");
  await expect(card.getByTestId("who-to-call")).toContainText("Example Garden Machines Ltd");
  await expect(card.getByTestId("who-to-call").getByRole("link", { name: /^Call \+353/ })).toHaveAttribute("href", /^tel:\+353/);
  await expect(card.getByTestId("contact-person")).not.toContainText("nobody set yet");
  // E7: on the item page the manual is in the one documents card beside it.
  await expect(page.getByTestId("documents").getByRole("link", { name: "Mow 46 user manual (sample)" })).toBeVisible();
  await expect(card).toContainText(/Warranty|warranty/);
  await s(page, "item-contact-card", project);

  // "Report a problem" shows the same card before anything is sent.
  await page.goto(`/tickets/new?item=${mower!.id}`);
  await expect(page.getByTestId("contact-card").getByTestId("who-to-call")).toContainText("Example Garden Machines Ltd");
  await s(page, "report-with-contact-card", project);

  // The seeded ticket was already passed to the company with a job number.
  const { data: ticket } = await master().from("maintenance_tickets").select("id").like("description", "Lawnmower will not start%").single();
  await page.goto(`/tickets/${ticket!.id}`);
  await expect(page.getByTestId("ticket-history")).toContainText("Passed to Example Garden Machines Ltd (their job number DEMO-123)");

  // Pass it again (a second visit), the suggested company already chosen.
  await openTicketMore(page);
  await page.getByTestId("fold-refer").locator("summary").click();
  const form = page.getByTestId("form-refer");
  await expect(form.getByRole("combobox", { name: "Company" })).toHaveValue(/[0-9a-f-]{36}/);
  await form.getByRole("textbox", { name: /job number/ }).fill(`T-${project}`);
  await s(page, "pass-to-company", project);
  await form.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText("passed to the company");
  await expect(page.getByTestId("ticket-history")).toContainText(`their job number T-${project}`);

  // The tickets list shows what was passed to that company.
  await page.goto("/tickets");
  await showFilters(page);
  await page.getByRole("combobox", { name: "Passed to" }).selectOption({ label: "Example Garden Machines Ltd" });
  await applyFilters(page);
  await expect(page.getByRole("main")).toContainText("Lawnmower will not start");
});

test("add a company and a make and model, upload a manual, hide a wrong one", async ({ page }, info) => {
  const project = info.project.name;
  const stamp = `Test run ${Date.now().toString(36)} ${project}`;

  await signInAs(page, centre, "/companies");
  await expect(page.getByRole("heading", { level: 1, name: "Companies" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Example Gates and Barriers Ltd");
  await s(page, "companies", project);

  await page.getByRole("link", { name: "Add a company" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a Company" })).toBeVisible();
  await page.getByRole("textbox", { name: "Name" }).fill(`${stamp} Boilers Ltd`);
  await page.getByRole("checkbox", { name: "Service and repair" }).check();
  await page.getByRole("textbox", { name: /Phone/ }).fill("+353 00 000 0299");
  await page.getByRole("textbox", { name: /Website/ }).fill("boilers.example");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${stamp} Boilers Ltd` })).toBeVisible();
  await expect(page.getByTestId("company-phone").filter({ visible: true })).toHaveAttribute("href", "tel:+353000000299");

  // A bad phone number is refused in plain words.
  await page.goto("/companies/new");
  await page.getByRole("textbox", { name: "Name" }).fill(`${stamp} Bad`);
  await page.getByRole("textbox", { name: /Phone/ }).fill("call me");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(page.getByTestId("form-error").filter({ visible: true })).toContainText("phone number");

  await page.goto("/models/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add a Make and Model" })).toBeVisible();
  await page.getByRole("combobox", { name: "Maker" }).selectOption({ label: `${stamp} Boilers Ltd` });
  await page.getByRole("textbox", { name: "Model" }).fill("B-100");
  await page.getByRole("combobox", { name: "Category" }).selectOption({ label: "Boilers" });
  await page.getByRole("spinbutton", { name: /Usual warranty/ }).fill("24");
  await page.getByRole("button", { name: "Add make and model" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "B-100" })).toBeVisible();

  // Upload a manual, then hide it with a reason.
  await page.getByText("Add a document", { exact: true }).click();
  await page.getByRole("textbox", { name: /Title/ }).fill("Test manual (made up)");
  await page.locator("#doc-file").setInputFiles({ name: "manual.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText("Document added");
  await expect(page.getByTestId("documents")).toContainText("Test manual (made up)");
  await s(page, "model-with-manual", project);
  await page.getByText("Hide this document").click();
  await page.getByRole("textbox", { name: "Why is it being hidden?" }).fill("Test: wrong model");
  await page.getByRole("button", { name: "Hide document" }).click();
  await expect(page.getByRole("status").filter({ visible: true })).toContainText("Document hidden");
  await expect(page.getByRole("main")).not.toContainText("Test manual (made up)");
});

test("the staff call sheet lists who to phone, category by category", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, centre, "/categories/call-sheet");
  const sheet = page.getByTestId("call-sheet");
  await expect(sheet).toContainText("If Something Breaks, Phone");
  await expect(sheet.getByTestId("call-row").filter({ hasText: "Garden, tools and cleaning equipment" })).toContainText("Example Garden Machines Ltd, +353 00 000 0203");
  await expect(sheet.getByTestId("call-row").filter({ hasText: "CCTV" })).toContainText("Example Security Systems Ltd");
  await page.emulateMedia({ media: "print" });
  await s(page, "call-sheet-on-paper", project);
  await page.emulateMedia({ media: "screen" });
});

test("finance sees no companies and no menu link", async ({ page }) => {
  await signInAs(page, finance, "/companies");
  await expect(page.getByTestId("companies-not-allowed")).toBeVisible();
  await expect((await mainMenu(page)).getByRole("link", { name: "Companies", exact: true })).toHaveCount(0);
});
