// Round C4: every spreadsheet (CSV) download, for every role. Each address is
// asked for directly, the way someone who guessed it would, so the check is
// on the download itself, not only on whether a button is shown.
//   * Super Admin and Centre Admin: every list.
//   * Finance: the asset register and the monthly expenses file only.
//   * Library Operator: none (not even the library lists).
//   * Signed out: none; sent to the sign-in page.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, signInWithEmailCode } from "./helpers";

const month = () => new Date().toISOString().slice(0, 7);

/** Every CSV address, the file name it gives, and which roles may have it. */
const DOWNLOADS: { path: () => string; file: RegExp; roles: string[] }[] = [
  { path: () => "/assets/register/csv", file: /icci-asset-register-\d{4}-\d{2}-\d{2}\.csv/, roles: ["super_admin", "centre_admin", "finance"] },
  { path: () => `/expenses/export/csv?month=${month()}`, file: /icci-expenses-\d{4}-\d{2}\.csv/, roles: ["super_admin", "centre_admin", "finance"] },
  { path: () => "/library/on-loan/csv", file: /icci-library-on-loan-/, roles: ["super_admin", "centre_admin"] },
  { path: () => "/library/overdue/csv", file: /icci-library-overdue-/, roles: ["super_admin", "centre_admin"] },
  { path: () => "/library/most-borrowed/csv", file: /icci-library-most-borrowed-/, roles: ["super_admin", "centre_admin"] },
  { path: () => "/library/lost/csv", file: /icci-library-lost-/, roles: ["super_admin", "centre_admin"] },
  { path: () => "/people/training/csv", file: /icci-training-\d{4}-\d{2}-\d{2}\.csv/, roles: ["super_admin", "centre_admin"] },
  { path: () => "/people/vetting/csv", file: /icci-garda-vetting-\d{4}-\d{2}-\d{2}\.csv/, roles: ["super_admin", "centre_admin"] },
  { path: () => "/tickets/csv", file: /icci-tickets-\d{4}-\d{2}-\d{2}\.csv/, roles: ["super_admin", "centre_admin"] },
];

async function checkAll(page: Page, role: string) {
  for (const d of DOWNLOADS) {
    const res = await page.request.get(d.path(), { maxRedirects: 0 });
    const where = `${role} ${d.path()}`;
    if (d.roles.includes(role)) {
      expect(res.status(), where).toBe(200);
      expect(res.headers()["content-type"], where).toContain("text/csv");
      expect(res.headers()["content-disposition"], where).toMatch(d.file);
      // A real file: a heading row at least.
      expect((await res.text()).split("\r\n")[0].length, where).toBeGreaterThan(5);
    } else {
      // Refused, never a file.
      expect([401, 403], where).toContain(res.status());
      expect(res.headers()["content-type"] ?? "", where).not.toContain("text/csv");
      expect(res.headers()["content-disposition"], where).toBeUndefined();
    }
  }
}

test.describe("every CSV download, for every role", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "Downloads are the same on a phone."));

  test("signed out: sent to the sign-in page, never a file", async ({ page }) => {
    for (const d of DOWNLOADS) {
      const res = await page.request.get(d.path(), { maxRedirects: 0 });
      expect(res.status(), d.path()).toBe(307);
      expect(res.headers()["location"], d.path()).toMatch(/\/sign-in/);
    }
  });

  for (const role of ["super_admin", "centre_admin", "finance"]) {
    test(`${role}: only the lists that role may have`, async ({ page }) => {
      const who = seedAdmin(role);
      await page.goto("/");
      await expectSignInPage(page);
      await completeSignIn(page, who.email, testAuthenticatorSecret(who.email));
      await checkAll(page, role);
    });
  }

  test("library_operator: none, not even the library lists", async ({ page }) => {
    await signInWithEmailCode(page, seedAdmin("library_operator").email);
    await checkAll(page, "library_operator");
  });
});
