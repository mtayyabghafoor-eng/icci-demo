// Phase 2, slice P2.6 in a real browser, on a PC-sized and a phone-sized
// window: record one signed sheet for several people with a scan, your own
// name cannot be ticked, withdraw a wrong sign-off, the person page, the
// policy grid with filters and its print view, a new version turning
// everyone back to unsigned, the home counter, and Finance's note.
// Every screen is saved to docs/screens/.
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_ADMINS, seedAdmin, samplePolicyPdf } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { addDays, addYears, todayInDublin } from "../../src/lib/vetting/rules";
import { apiAs, completeSignIn, expectCurrentMenuLink, expectSignInPage, shot, showFilters, applyFilters } from "./helpers";

const centre = seedAdmin("centre_admin");
const second = SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!;
const finance = seedAdmin("finance");
const s = (page: Page, name: string, project: string) => shot(page, name, project, "p2-6");

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const master = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, options);

async function idOf(table: "person_roles" | "sections", name: string) {
  const { data, error } = await master().from(table).select("id").eq("name", name).single();
  if (error) throw error;
  return data.id as string;
}

async function newPerson(name: string, role = "Gardener") {
  const { data, error } = await master()
    .from("people")
    .insert({ full_name: name, person_role_id: await idOf("person_roles", role), section_id: await idOf("sections", "Maintenance") })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** A policy that Gardeners and Staff must sign, with v1 uploaded by Centre Admin and published by Second Admin. */
async function publishedPolicy(project: string) {
  const stamp = `${Date.now()} ${project}`;
  const people = [await newPerson(`Test run ${stamp} Gardener One`), await newPerson(`Test run ${stamp} Gardener Two`)];
  const c = await apiAs(centre.email);
  const title = `Test run ${stamp} signed policy`;
  const { data: policy, error } = await c.from("policies").insert({ title, owner_person_id: people[0] }).select("id").single();
  if (error) throw error;
  const roles = await c
    .from("policy_required_roles")
    .insert([await idOf("person_roles", "Gardener"), await idOf("person_roles", "Staff")].map((person_role_id) => ({ policy_id: policy.id, person_role_id })));
  if (roles.error) throw roles.error;
  const version = await upload(c, policy.id, "v1");
  const pub = await (await apiAs(second.email)).from("policy_versions").update({ status: "published" }).eq("id", version);
  if (pub.error) throw pub.error;
  return { id: policy.id as string, title, people, names: [`Test run ${stamp} Gardener One`, `Test run ${stamp} Gardener Two`] };
}

async function upload(c: SupabaseClient, policyId: string, label: string) {
  const path = `policies/${policyId}/${crypto.randomUUID()}.pdf`;
  // The free development database sometimes refuses for a moment ("Too many
  // connections") when the whole suite runs; that says nothing about the
  // app, so this setup step tries up to three times, two seconds apart.
  for (let attempt = 1; ; attempt++) {
    const up = await c.storage.from("policy-files").upload(path, samplePolicyPdf("Test run policy", label), { contentType: "application/pdf" });
    if (!up.error) break;
    if (attempt >= 3 || !/too many connections/i.test(up.error.message)) throw up.error;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const approved_on = addDays(todayInDublin(), -5);
  const { data, error } = await c
    .from("policy_versions")
    .insert({ policy_id: policyId, version_label: label, file_path: path, approved_on, next_review_on: addYears(approved_on, 1) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function signInAs(page: Page, who: { email: string }, path: string) {
  await page.goto(path);
  await expectSignInPage(page);
  await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
}

test("record one signed sheet for two people, then withdraw a wrong one", async ({ page }, info) => {
  const project = info.project.name;
  const policy = await publishedPolicy(project);
  await signInAs(page, centre, `/policies/${policy.id}`);
  const box = page.getByTestId("signoffs");
  await expect(page.getByTestId("signed-count")).toContainText(/^0 of \d+ signed$/);

  await box.getByRole("link", { name: "Record sign-off" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Record sign-off" })).toBeVisible();
  // Your own name is listed (you are Staff) but cannot be ticked.
  const me = page.getByRole("checkbox", { name: /Test Centre Admin/ });
  await expect(me).toBeDisabled();
  await expect(page.getByTestId("signoff-people")).toContainText("This is you.");
  await page.getByRole("checkbox", { name: policy.names[0] }).check();
  await page.getByRole("checkbox", { name: policy.names[1] }).check();
  await page.getByLabel("Date signed").fill(addDays(todayInDublin(), -1));
  await page.getByLabel(/Scan of the signed sheet/).setInputFiles({
    name: "sheet.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(samplePolicyPdf("Test signed sheet", "scan")),
  });
  await s(page, "record-signoff", project);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByTestId("notice")).toHaveText("Sign-offs recorded for 2 people.");
  const squares = page.getByTestId("signoff-squares").getByRole("listitem");
  for (const name of policy.names) await expect(squares.filter({ hasText: name }).getByTestId("status")).toHaveText("Signed");
  const history = page.getByTestId("signoff-history").getByRole("listitem");
  await expect(history).toHaveCount(2);
  const scan = history.first().getByRole("link", { name: "Open scan" });
  const res = await page.request.get((await scan.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  await s(page, "policy-signoffs", project);

  // Wrong person: withdraw it with a reason.
  const wrong = history.filter({ hasText: policy.names[1] });
  await wrong.getByText("Withdraw this entry").click();
  await wrong.getByLabel("Why is it wrong?").fill("Test: ticked the wrong name");
  await wrong.getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByTestId("notice")).toHaveText(/withdrawn/i);
  await expect(squares.filter({ hasText: policy.names[1] }).getByTestId("status")).toHaveText("Unsigned");
  await expect(history.filter({ hasText: policy.names[1] })).toContainText("Test: ticked the wrong name");
  await s(page, "policy-signoff-withdrawn", project);

  // The person page lists the policy with its square.
  await page.goto(`/people/${policy.people[0]}`);
  const theirs = page.getByTestId("person-policies").getByRole("listitem").filter({ hasText: policy.title });
  await expect(theirs.getByTestId("status")).toHaveText("Signed");
  await s(page, "person-policies", project);

  // A new version, published by the other admin, starts everyone at unsigned.
  const v2 = await upload(await apiAs(centre.email), policy.id, "v2");
  const pub = await (await apiAs(second.email)).from("policy_versions").update({ status: "published" }).eq("id", v2);
  expect(pub.error).toBeNull();
  await page.reload();
  await expect(theirs.getByTestId("status")).toHaveText("Unsigned");
  await expect(theirs).toContainText("Version v2");
});

test("the policy grid: filters and the print view", async ({ page }, info) => {
  const project = info.project.name;
  const policy = await publishedPolicy(project);
  await (await apiAs(centre.email))
    .from("policy_signoffs")
    .insert({ person_id: policy.people[0], policy_version_id: (await master().from("policies_overview").select("current_version_id").eq("id", policy.id).single()).data!.current_version_id, signed_on: todayInDublin() });

  await signInAs(page, centre, "/policies/grid");
  await expect(page.getByRole("heading", { level: 1, name: "Policy grid" })).toBeVisible();
  await expectCurrentMenuLink(page, "Policy grid");
  await expect(page.getByTestId("policy-grid")).toContainText("Test policy: Health and safety");
  await s(page, "policy-grid", project);

  await showFilters(page);
  await page.locator('select[name="role"]').selectOption({ label: "Gardener" });
  await page.locator('select[name="status"]').selectOption({ label: "Signed" });
  await applyFilters(page);
  await expect(page).toHaveURL(/status=signed/);
  const rows = page.getByTestId("grid-person").filter({ visible: true });
  await expect(rows.filter({ hasText: policy.names[0] })).toBeVisible();
  await expect(rows.filter({ hasText: policy.names[1] })).toHaveCount(0);
  for (const text of await rows.allInnerTexts()) expect(text).toContain("Gardener");
  await s(page, "policy-grid-filtered", project);

  await page.getByRole("link", { name: "Print view" }).click();
  await expect(page).toHaveURL(/\/policies\/grid\/print\?.*status=signed/);
  await expect(page.getByRole("heading", { level: 1, name: "ICCI policy sign-offs" })).toBeVisible();
  await expect(page.getByText("Role: Gardener").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  await expect(page.getByTestId("grid-person").filter({ visible: true }).filter({ hasText: policy.names[0] })).toBeVisible();
  await s(page, "policy-grid-print", project);
});

test("the home page counts unsigned sign-offs and opens the grid", async ({ page }, info) => {
  await signInAs(page, centre, "/");
  const card = page.getByTestId("counter-signoffs");
  await expect(card).toContainText("Policy sign-offs overdue or unsigned");
  expect(Number(await card.getByTestId("count").textContent())).toBeGreaterThan(0);
  await card.click();
  // A5: Home opens the grid showing only people with something to sign.
  await expect(page).toHaveURL(/\/policies\/grid\?status=attention$/);
  await s(page, "home-signoffs", info.project.name);
});

test("finance sees a note instead of the grid", async ({ page }, info) => {
  await signInAs(page, finance, "/policies/grid");
  await expect(page.getByTestId("cannot-see-policies")).toBeVisible();
  await page.goto("/policies/grid/print");
  await expect(page.getByTestId("cannot-see-policies")).toBeVisible();
  await s(page, "grid-finance", info.project.name);
});
