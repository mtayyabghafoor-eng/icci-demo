// Phase 2, slice P2.5 in a real browser, on a PC-sized and a phone-sized
// window: add a policy with who must sign it, upload a draft version (the
// review date fills itself in a year later), the uploader cannot publish,
// a different admin publishes, a new version replaces the old one, a
// published version cannot be changed, and Finance sees a note.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { SEED_ADMINS, seedAdmin, samplePolicyPdf } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { addDays, addYears, todayInDublin } from "../../src/lib/vetting/rules";
import { completeSignIn, expectCurrentMenuLink, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-5");

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

/** Opens a policy from the list (a table row on a PC, a card on a phone). */
async function openPolicy(page: Page, title: string) {
  await page.getByRole("link", { name: title }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

async function uploadDraft(page: Page, label: string, approvedOn: string, title: string) {
  await page.getByRole("link", { name: "Upload a new version" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Upload a new version" })).toBeVisible();
  await page.getByLabel("Version name").fill(label);
  await page.getByLabel("Approval date").fill(approvedOn);
  // Filled in automatically: one year after approval.
  await expect(page.getByLabel("Next review date")).toHaveValue(addYears(approvedOn, 1));
  await page.getByLabel("PDF").setInputFiles({ name: "policy.pdf", mimeType: "application/pdf", buffer: Buffer.from(samplePolicyPdf(title, label)) });
}

test("add a policy, upload a draft, and a different admin publishes it", async ({ page }, info) => {
  const project = info.project.name;
  const title = `Test run ${Date.now()} ${project} policy`;
  const approvedOn = addDays(todayInDublin(), -7);

  await signInAs(page, centre, "/policies");
  await expect(page.getByRole("heading", { level: 1, name: "Policies" })).toBeVisible();
  await expectCurrentMenuLink(page, "Policies");
  await expect(page.getByTestId("policy-row").filter({ visible: true }).filter({ hasText: "Test policy: Health and safety" })).toBeVisible();
  await s(page, "policies-list", project);

  await page.getByRole("link", { name: "Add a policy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a policy" })).toBeVisible();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Owner").selectOption({ label: "Test Amina Sample" });
  await page.getByRole("checkbox", { name: "Board member" }).check();
  await page.getByRole("checkbox", { name: "Imam" }).check();
  await s(page, "add-policy", project);
  await page.getByRole("button", { name: "Add policy" }).click();

  await expect(page.getByTestId("notice")).toHaveText(/Policy added/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByTestId("review-status")).toHaveText("Not published yet");
  await expect(page.getByTestId("must-sign")).toContainText("switched-on people");
  await expect(page.getByRole("checkbox", { name: "Imam" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Staff" })).not.toBeChecked();

  await uploadDraft(page, "v1", approvedOn, title);
  await s(page, "upload-version", project);
  await page.getByRole("button", { name: "Upload draft" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Draft uploaded/);
  const versions = page.getByTestId("version");
  await expect(versions).toHaveCount(1);
  await expect(versions.first().getByTestId("status")).toHaveText("Draft");
  await expect(versions.first().getByRole("link", { name: "Open PDF" })).toBeVisible();
  // The uploader cannot publish it.
  await expect(versions.first().getByTestId("own-draft")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Upload a new version" })).toHaveCount(0);
  await s(page, "policy-draft-own", project);
  const policyUrl = page.url().replace(/\?.*$/, "");

  // The PDF opens (through a short-lived private link).
  const href = await versions.first().getByRole("link", { name: "Open PDF" }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // A different admin publishes it.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectSignInPage(page);
  await signInAs(page, second, new URL(policyUrl).pathname);
  await s(page, "policy-draft-other-admin", project);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Published/);
  await expect(page.getByTestId("current-version")).toHaveText("v1");
  await expect(page.getByTestId("review-status")).toHaveText("Up to date");
  await expect(versions.first().getByTestId("status")).toHaveText("Current");
  await expect(versions.first()).toContainText(`Published by ${second.displayName}`);
  await expect(versions.first().getByRole("link", { name: "Change this draft" })).toHaveCount(0);
  await s(page, "policy-published", project);

  // v2 replaces v1 once published by the other admin.
  await uploadDraft(page, "v2", todayInDublin(), title);
  await page.getByRole("button", { name: "Upload draft" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Draft uploaded/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectSignInPage(page);
  await signInAs(page, centre, new URL(policyUrl).pathname);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("current-version")).toHaveText("v2");
  await expect(versions).toHaveCount(2);
  await expect(versions.nth(0).getByTestId("status")).toHaveText("Current");
  await expect(versions.nth(1).getByTestId("status")).toHaveText("Replaced");
  await s(page, "policy-two-versions", project);
});

test("change a draft; whoever changed it cannot publish it; a published version is locked", async ({ page }, info) => {
  const project = info.project.name;
  const title = `Test run ${Date.now()} ${project} draft policy`;
  await signInAs(page, second, "/policies/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Owner").selectOption({ label: "Test Amina Sample" });
  await page.getByRole("button", { name: "Add policy" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Policy added/);
  await uploadDraft(page, "v1", addDays(todayInDublin(), -3), title);
  await page.getByRole("button", { name: "Upload draft" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Draft uploaded/);
  const policyPath = new URL(page.url()).pathname;

  await page.getByRole("button", { name: "Sign out" }).click();
  await expectSignInPage(page);
  await signInAs(page, centre, policyPath);
  // Centre Admin could publish it, but changes it first...
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  await page.getByRole("link", { name: "Change this draft" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Change draft" })).toBeVisible();
  await page.getByLabel("Version name").fill("v1.1");
  await page.getByLabel("Next review date").fill(addYears(todayInDublin(), 2));
  await s(page, "change-draft", project);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/Draft saved/);
  // ...so now a different admin must publish it.
  await expect(page.getByTestId("own-draft")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await expect(page.getByTestId("version").first()).toContainText("v1.1");

  // A published seed version cannot be changed, even by going to its address.
  await page.goto("/policies");
  await openPolicy(page, "Test policy: Safeguarding children");
  await expect(page.getByTestId("review-status")).toHaveText("Review due soon");
  await s(page, "policy-review-due", project);
  const current = page.getByTestId("version").first();
  await expect(current.getByRole("link", { name: "Change this draft" })).toHaveCount(0);
});

test("the seed's waiting drafts: one for this admin to publish, one they uploaded", async ({ page }, info) => {
  await signInAs(page, centre, "/policies");
  // The seed's Data protection v2 was uploaded by Test Second Admin, so Test Centre Admin may publish it.
  const row = page.getByTestId("policy-row").filter({ visible: true }).filter({ hasText: "Test policy: Data protection" });
  await expect(row).toContainText("A draft is waiting to be published.");
  // The seed's code of conduct draft was uploaded by Test Centre Admin: only a note.
  await openPolicy(page, "Test policy: Volunteer code of conduct");
  await expect(page.getByTestId("own-draft")).toBeVisible();
  await s(page, "policy-only-draft", info.project.name);
});

test("finance sees a note instead of policies", async ({ page }, info) => {
  await signInAs(page, finance, "/policies");
  await expect(page.getByTestId("cannot-see-policies")).toBeVisible();
  await page.goto("/policies/new");
  await expect(page.getByTestId("cannot-see-policies")).toBeVisible();
  await s(page, "policies-finance", info.project.name);
});
