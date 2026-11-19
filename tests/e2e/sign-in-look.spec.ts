// Slice UI-3 in a real browser, PC and phone: the sign-in screens show the
// Centre photograph and the round logo to a signed-out visitor, and the
// 6-digit code is typed into one field drawn as six boxes.
import { expect, test } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { enterPassword, expectSignInPage } from "./helpers";

const centre = seedAdmin("centre_admin");

test("a signed-out visitor sees the Centre photograph and the round logo", async ({ page }) => {
  await page.goto("/sign-in");
  await expectSignInPage(page);
  const panel = page.getByRole("region", { name: "Islamic Cultural Centre of Ireland" });
  await expect(panel).toBeVisible();
  // Both images really load (the gatekeeper lets image files through).
  for (const img of await panel.locator("img").all()) {
    if (!(await img.isVisible())) continue;
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(panel.getByRole("img", { name: /Islamic Cultural Centre of Ireland logo/ })).toBeVisible();
});

test("the code shows digit by digit in six boxes, and pasting a whole code works", async ({ page }, info) => {
  await page.goto("/sign-in");
  await enterPassword(page, centre.email);
  await expect(page.getByRole("heading", { level: 1, name: "Enter your code" })).toBeVisible();

  const field = page.getByLabel("6-digit code");
  const boxes = page.getByTestId("code-box");
  await expect(boxes).toHaveCount(6);

  await field.pressSequentially("123");
  await expect(boxes).toHaveText(["1", "2", "3", "", "", ""]);
  await page.screenshot({ path: `docs/screens/slice-ui-3-code-typing-${info.project.name}.png`, caret: "initial" });

  // A pasted code with a space in the middle, as some apps copy it.
  await field.fill("654 321");
  await expect(boxes).toHaveText(["6", "5", "4", "3", "2", "1"]);

  await page.getByRole("button", { name: "Cancel and sign out" }).click();
  await expectSignInPage(page);
});
