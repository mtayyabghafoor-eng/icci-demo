// Slices P5.2 to P5.4 in a real browser, on a PC-sized and a phone-sized
// window: entering a claim with a receipt picture, the duplicate warning,
// approving with a fund (and the "Are you sure?" sheet), who cannot decide
// and why, withdraw and "Enter again" with the receipt carried across, a
// lost receipt, the Waiting and Awaiting repayment tabs, one repayment for
// a person, a correction, a claim from a ticket, Finance's Home and phone
// shortcuts, and the Library Operator kept out. Every screen is saved to
// docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { apiAs, completeSignIn, confirmSheet, expectSignInPage, shot, signInWithEmailCode } from "./helpers";

const byEmail = (prefix: string) => SEED_ADMINS.find((a) => a.email.startsWith(prefix))!;
const centre = seedAdmin("centre_admin"); // linked
const second = byEmail("second.admin"); // linked
const financeA = seedAdmin("finance"); // not linked
const financeB = byEmail("finance.two"); // linked
const superB = byEmail("super.two"); // linked
const library = seedAdmin("library_operator");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p5-2");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

const saved = (page: Page) => page.getByTestId("notice").filter({ visible: true });
/** After a form is sent, Next.js keeps the previous screen hidden in the page: look only at what is shown. */
const shown = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

// A tiny made-up PNG receipt (1 by 1 pixel).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** An amount nobody else has used today, so no duplicate warning appears by chance. */
const oddAmount = () => `${100 + Math.floor(Math.random() * 800)}.${String(Math.floor(Math.random() * 99)).padStart(2, "0")}`;

async function fillClaim(page: Page, o: { amount: string; description: string; payer?: string; lost?: string }) {
  if (o.lost) {
    await page.getByTestId("receipt-lost").check();
    await page.getByLabel("Why is there no receipt?").fill(o.lost);
  } else {
    // Picked again if the page was not quite ready to notice the first time.
    await expect(async () => {
      if ((await page.getByTestId("receipt-picked").locator("li").count()) === 0) {
        await page.getByTestId("receipt-choose").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
      }
      await expect(page.getByTestId("receipt-picked").locator("li")).toHaveCount(1, { timeout: 2000 });
    }).toPass();
  }
  await page.getByLabel("Amount on the receipt (€)").fill(o.amount);
  await page.getByLabel("What was it for?").fill(o.description);
  await page.getByLabel("Spend category").selectOption({ label: "Cleaning and hygiene" });
  if (o.payer) await page.getByTestId("paid-by").selectOption({ label: o.payer });
}

/** A claim entered through the database as the Centre Admin (with a receipt), for tests that start later. */
async function claimByApi(o: { amountCents?: number; payment?: string; payer?: string } = {}) {
  const c = await apiAs(centre.email);
  const path = `claims/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-receipt-1.png`;
  await c.storage.from("expense-receipts").upload(path, PNG, { contentType: "image/png" });
  const { data: cats } = await c.from("expense_categories").select("id").eq("name", "Other").single();
  const { data: people } = await c.from("people").select("id").eq("full_name", o.payer ?? "Test Amina Byrne").maybeSingle();
  const fallback = (await c.from("people").select("id").eq("active", true).is("app_user_id", null).limit(1).single()).data!;
  const { data, error } = await c.rpc("enter_expense_claim", {
    p_amount_cents: o.amountCents ?? 1000 + Math.floor(Math.random() * 40000),
    p_receipt_date: new Date().toISOString().slice(0, 10),
    p_category_id: cats!.id,
    p_description: `Test run ${Date.now().toString(36)} claim`,
    p_payment: o.payment ?? "personal",
    p_paid_by_person_id: o.payment === "centre_direct" ? null : (people?.id ?? fallback.id),
    p_files: [path],
  });
  if (error) throw error;
  return data as number;
}

test("a Centre Admin enters a claim with a receipt picture; it waits for someone else", async ({ page }, info) => {
  const project = info.project.name;
  const description = `Test run ${Date.now().toString(36)} mop heads ${project}`;
  const amount = oddAmount();
  await signInAs(page, centre, "/expenses/new");
  await expect(page.getByRole("heading", { level: 1, name: "New Claim" })).toBeVisible();
  // "Who paid" starts with you when your account is linked.
  await expect(page.getByTestId("paid-by")).toHaveValue(/[0-9a-f-]{36}/);
  await fillClaim(page, { amount, description });
  await s(page, "new-claim", project);
  await page.getByRole("button", { name: "Save claim" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^EXP-\d{4}$/);
  await expect(saved(page)).toContainText("Claim saved");
  await expect(shown(page, "claim-status")).toContainText("Waiting");
  await expect(shown(page, "receipt-files").locator("img")).toHaveCount(1);
  await expect(shown(page, "cannot-decide")).toContainText("You entered this claim");
  await s(page, "claim-waiting-own", project);

  // The same amount on the same date again: a warning, then "Save anyway".
  await page.goto("/expenses/new");
  await fillClaim(page, { amount, description: `${description} again` });
  await page.getByRole("button", { name: "Save claim" }).click();
  await expect(shown(page, "duplicate-warning")).toContainText("is already recorded for");
  await s(page, "duplicate-warning", project);
  await page.getByRole("button", { name: "Save anyway" }).click();
  await expect(shown(page, "claim-status")).toContainText("Waiting");
});

test("another linked admin approves a claim with a fund, after the 'Are you sure?' sheet", async ({ page }, info) => {
  const project = info.project.name;
  const id = await claimByApi({ amountCents: 4321 });
  await signInAs(page, second, `/expenses/${id}`);
  await expect(shown(page, "receipt-files").locator("img")).toHaveCount(1);
  await page.getByTestId("form-approve").getByLabel("Fund this money comes from").selectOption({ label: "Zakat (restricted)" });
  await s(page, "claim-decide", project);
  await page.getByTestId("approve").click();
  await expect(page.locator("dialog[open]")).toContainText("€43.21");
  await expect(page.locator("dialog[open]")).toContainText("Zakat");
  await confirmSheet(page);
  await expect(saved(page)).toHaveText("Approved.");
  await expect(shown(page, "claim-status")).toContainText("Approved");
  await expect(shown(page, "claim-status")).toContainText("Awaiting repayment");
  await s(page, "claim-approved", project);
});

test("an unlinked Finance account is told why it cannot decide; a linked one rejects with a reason", async ({ page }, info) => {
  const project = info.project.name;
  const id = await claimByApi();
  await signInAs(page, financeA, `/expenses/${id}`);
  await expect(shown(page, "cannot-decide")).toContainText("not linked");
  // Round C3: /sign-out no longer ends a sign-in that is not due; clear it instead.
  await page.context().clearCookies();
  await page.goto("/");
  await signInAs(page, financeB, `/expenses/${id}`);
  await page.getByText("Reject this claim", { exact: true }).click();
  await page.getByTestId("form-reject").getByLabel("Why is it rejected?").fill("Test: a personal purchase");
  await page.getByTestId("reject").click();
  await confirmSheet(page);
  await expect(shown(page, "claim-status")).toContainText("Rejected");
  await expect(page.getByText("Test: a personal purchase")).toBeVisible();
  await s(page, "claim-rejected", project);
});

test("whoever entered a claim withdraws it and enters it again, the receipt carried across", async ({ page }, info) => {
  const project = info.project.name;
  const id = await claimByApi();
  await signInAs(page, centre, `/expenses/${id}`);
  await page.getByText("Something wrong? Withdraw it").click();
  await page.getByTestId("form-withdraw").getByLabel("Why are you withdrawing it?").fill("Test: typed the wrong amount");
  await page.getByTestId("withdraw").click();
  await confirmSheet(page);
  await expect(shown(page, "claim-status")).toContainText("Withdrawn");
  await page.getByRole("link", { name: "Enter again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Enter Again" })).toBeVisible();
  await expect(shown(page, "keep-files")).toBeChecked();
  await page.getByLabel("Amount on the receipt (€)").fill(oddAmount());
  await s(page, "enter-again", project);
  await page.getByRole("button", { name: "Save claim" }).click();
  await expect(shown(page, "claim-status")).toContainText("Waiting");
  await expect(shown(page, "receipt-files").locator("img")).toHaveCount(1);
  await expect(page.getByText(`EXP-${String(id).padStart(4, "0")}`).first()).toBeVisible();
});

test("a claim with a lost receipt is marked 'No receipt'", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, second, "/expenses/new");
  await fillClaim(page, { amount: oddAmount(), description: `Test run ${Date.now().toString(36)} stamps`, lost: "Test: the post office gave no receipt" });
  await page.getByRole("button", { name: "Save claim" }).click();
  await expect(shown(page, "claim-status")).toContainText("No receipt");
  await expect(shown(page, "receipt-lost-note")).toContainText("gave no receipt");
  await s(page, "claim-no-receipt", project);
});

test("the Waiting tab marks claims 'For you'; Awaiting repayment groups by person and records one repayment", async ({ page }, info) => {
  const project = info.project.name;
  // Two approved claims of one made-up person's own money.
  const approver = await apiAs(second.email);
  const fund = (await approver.from("expense_funds").select("id").eq("name", "Unrestricted").single()).data!.id;
  const { data: payer } = await approver.from("people").select("id, full_name").eq("active", true).is("app_user_id", null).like("full_name", "Test %").order("full_name", { ascending: false }).limit(1).single();
  const ids: number[] = [];
  for (const cents of [1111, 2222]) {
    const id = await claimByApi({ amountCents: cents, payer: payer!.full_name });
    await approver.from("expense_decisions").insert({ claim_id: id, kind: "approved", fund_id: fund });
    ids.push(id);
  }
  await claimByApi(); // one more waiting, for the Waiting tab

  await signInAs(page, superB, "/expenses");
  await expect(page.getByTestId("waiting-count")).toContainText("for you to decide");
  await expect(page.getByTestId("for-you").first()).toBeVisible();
  await s(page, "expenses-waiting", project);

  await page.getByRole("link", { name: "Awaiting repayment" }).click();
  const group = page.getByTestId("owed-person").filter({ hasText: payer!.full_name });
  await expect(group).toContainText("€33.33");
  await s(page, "expenses-awaiting-repayment", project);
  await group.getByText(/^Record the repayment/).click();
  await group.getByLabel("Reference (optional)").fill("TEST-E2E");
  await group.getByTestId("record-repayment").click();
  await confirmSheet(page);
  await expect(saved(page)).toHaveText("Repayment recorded.");
  await expect(page.getByTestId("owed-person").filter({ hasText: payer!.full_name })).toHaveCount(0);

  await page.goto(`/expenses/${ids[0]}`);
  await expect(shown(page, "claim-owed")).toContainText("Yes, €11.11");
  await expect(shown(page, "claim-repayments")).toContainText("TEST-E2E");
});

test("an approved claim is corrected with a new entry that another admin approves", async ({ page }, info) => {
  const project = info.project.name;
  const id = await claimByApi({ amountCents: 4500 });
  const approver = await apiAs(second.email);
  const fund = (await approver.from("expense_funds").select("id").eq("name", "Unrestricted").single()).data!.id;
  await approver.from("expense_decisions").insert({ claim_id: id, kind: "approved", fund_id: fund });

  await signInAs(page, centre, `/expenses/${id}`);
  await page.getByRole("link", { name: "Correct this claim" }).click();
  await page.getByLabel("Right amount (€)").fill("54.00");
  await page.getByLabel("Why is it being corrected?").fill("Test: the receipt says €54, not €45");
  await s(page, "correct-claim", project);
  await page.getByRole("button", { name: "Send the correction for approval" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Correction EXP-\d{4}$/);
  await expect(shown(page, "cannot-decide")).toContainText("You entered this claim");
  const correction = Number(page.url().match(/expenses\/(\d+)/)![1]);
  await approver.from("expense_decisions").insert({ claim_id: correction, kind: "approved", fund_id: fund });

  await page.goto(`/expenses/${id}`);
  await expect(shown(page, "claim-amount")).toContainText("€54.00");
  await expect(shown(page, "claim-amount")).toContainText("first entered as €45.00");
  await expect(shown(page, "claim-status")).toContainText("Corrected");
  await s(page, "claim-corrected", project);
});

// Security review 26 Nov 2026, findings 3 and 4 (migration 0053): whoever
// entered a claim does not pay it back, and a repaid claim corrected to less
// shows the money to get back, on the claim, under Awaiting repayment and in
// the Board report.
test("a repaid claim corrected to less shows money to get back; whoever entered it cannot pay it back", async ({ page }, info) => {
  const project = info.project.name;
  const approver = await apiAs(second.email);
  const other = await apiAs(superB.email);
  const fund = (await approver.from("expense_funds").select("id").eq("name", "Unrestricted").single()).data!.id;
  // Repaid at €40, then corrected to €10 by a different admin.
  const repaid = await claimByApi({ amountCents: 4000 });
  expect((await approver.from("expense_decisions").insert({ claim_id: repaid, kind: "approved", fund_id: fund })).error).toBeNull();
  expect((await other.rpc("record_expense_repayment", { p_claim_ids: [repaid], p_paid_on: new Date().toISOString().slice(0, 10), p_method: "cash" })).error).toBeNull();
  const r = (await other.from("expense_claim_list").select("*").eq("id", repaid).single()).data!;
  const fix = await other.rpc("enter_expense_claim", {
    p_amount_cents: 1000,
    p_receipt_date: r.current_receipt_date,
    p_category_id: r.current_category_id,
    p_description: null,
    p_payment: r.payment,
    p_paid_by_person_id: r.paid_by_person_id,
    p_suggested_fund_id: fund,
    p_corrects_id: repaid,
    p_correction_reason: "Test: half of it was for the shop",
  });
  expect(fix.error).toBeNull();
  expect((await approver.from("expense_decisions").insert({ claim_id: fix.data, kind: "approved", fund_id: fund })).error).toBeNull();
  // One more approved claim, still owed, entered by the Centre Admin.
  const owed = await claimByApi({ amountCents: 1234 });
  expect((await approver.from("expense_decisions").insert({ claim_id: owed, kind: "approved", fund_id: fund })).error).toBeNull();

  await signInAs(page, centre, "/expenses");
  await page.getByRole("link", { name: "Awaiting repayment" }).click();
  const group = page.getByTestId("owed-person").filter({ hasText: `EXP-${String(owed).padStart(4, "0")}` });
  await expect(group).toContainText("another admin");
  const back = page.getByTestId("to-get-back");
  await expect(back).toContainText("Paid too much");
  await expect(back.getByTestId("overpaid-row").filter({ hasText: `EXP-${String(repaid).padStart(4, "0")}` })).toContainText("€30.00 to get back");
  await back.scrollIntoViewIfNeeded();
  await shot(page, "to-get-back", project, "p5-7");

  await page.goto(`/expenses/${repaid}`);
  await expect(shown(page, "claim-owed")).toContainText("Paid too much: €30.00 to get back");
  await expect(shown(page, "claim-repayments")).toContainText("another admin withdraws it");
  await expect(page.getByText("Withdraw this repayment")).toHaveCount(0);
  await shot(page, "claim-paid-too-much", project, "p5-7");

  const month = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" }).slice(0, 7);
  await page.goto(`/board-report?month=${month}`);
  await expect(page.getByText("Paid too much, to get back")).toBeVisible();
  // Finding 5 (migration 0054): stray receipt files are counted.
  await expect(page.getByText("Receipt files not on any claim")).toBeVisible();
  await page.getByText("Paid too much, to get back").scrollIntoViewIfNeeded();
  await shot(page, "board-to-get-back", project, "p5-7");
});

test("a ticket offers 'Add an expense claim', filled in from the ticket", async ({ page }) => {
  const c = await apiAs(centre.email);
  const { data: t } = await c.from("maintenance_tickets").select("id").order("id").limit(1).single();
  await signInAs(page, centre, `/tickets/${t!.id}`);
  await expect(page.getByTestId("ticket-claims")).toBeVisible();
  await page.getByRole("link", { name: "Add an expense claim for this ticket" }).click();
  await expect(page.getByLabel("What was it for?")).toHaveValue(/^Repair: /);
  await expect(page.getByLabel("Spend category")).toHaveValue(/[0-9a-f-]{36}/);
});

test("Finance's Home counts claims and offers its pages; on a phone the bar has its own shortcuts", async ({ page }, info) => {
  const project = info.project.name;
  await signInAs(page, financeB, "/");
  await expect(page.getByTestId("headline-expenses-for-me")).toBeVisible();
  await expect(page.getByTestId("headline-owed")).toBeVisible();
  await expect(page.getByRole("link", { name: "New claim With its receipt" })).toBeVisible();
  if (project === "phone") {
    const bar = page.getByRole("navigation", { name: /shortcuts|bottom/i });
    await expect(bar.getByRole("link", { name: "New claim" })).toBeVisible();
    await expect(bar.getByRole("link", { name: "To repay" })).toBeVisible();
  }
  await s(page, "home-finance", project);
});

test("the Library Operator cannot see expenses", async ({ page }) => {
  await signInWithEmailCode(page, library.email);
  await page.goto("/expenses");
  await expect(page.getByTestId("cannot-see-expenses")).toBeVisible();
  await page.goto("/expenses/new");
  await expect(page.getByTestId("cannot-see-expenses")).toBeVisible();
});
