// Slice UI-7 in a real browser: the plus and minus control for counts, and
// the in-app label scanner on the Scan page. The test browser has no camera
// and no QR reader, so a stand-in camera (a blank moving picture) and a
// stand-in QR reader (it "sees" whatever the test sets) are put in place.
// Nothing is saved by these tests.
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { testAuthenticatorSecret } from "../../scripts/test-authenticators.mts";
import { completeSignIn, expectSignInPage, shot } from "./helpers";

const centre = seedAdmin("centre_admin");

async function signIn(page: Page, to: string) {
  await page.goto(to);
  await expectSignInPage(page);
  await completeSignIn(page, centre.email, testAuthenticatorSecret(centre.email));
}

/** A stand-in camera and QR reader. The reader "sees" window.__code. */
async function fakeCameraAndReader(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __code?: string; BarcodeDetector?: unknown };
    w.BarcodeDetector = class {
      async detect() {
        return w.__code ? [{ rawValue: w.__code }] : [];
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 240;
      const g = canvas.getContext("2d")!;
      let n = 0;
      setInterval(() => {
        g.fillStyle = n++ % 2 ? "#004236" : "#006b54";
        g.fillRect(0, 0, 240, 240);
      }, 100);
      const stream = canvas.captureStream(10);
      (window as unknown as { __stream: MediaStream }).__stream = stream;
      return stream;
    };
  });
}

test("plus and minus change the count, and the number can still be typed", async ({ page }, info) => {
  await signIn(page, "/items?kind=consumable");
  await page.locator("a[href^='/items/']").filter({ visible: true }).filter({ hasNotText: "Register" }).first().click();
  await page.getByRole("link", { name: "Count this shelf" }).click();
  const box = page.getByLabel("How many are on the shelf now?");
  await expect(box).toBeVisible();
  await page.getByRole("button", { name: "One more" }).click();
  await page.getByRole("button", { name: "One more" }).click();
  await expect(box).toHaveValue("2");
  await page.getByRole("button", { name: "One less" }).click();
  await expect(box).toHaveValue("1");
  // Never below nothing.
  await page.getByRole("button", { name: "One less" }).click();
  await page.getByRole("button", { name: "One less" }).click();
  await expect(box).toHaveValue("0");
  await box.fill("12");
  await expect(box).toHaveValue("12");
  await shot(page, "count-stepper", info.project.name, "ui-7");
});

test("without a QR reader in the browser, the Scan page shows only the Camera-app steps", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });
  await signIn(page, "/scan");
  await expect(page.getByRole("heading", { name: "With the phone's Camera app" })).toBeVisible();
  await expect(page.getByTestId("camera-scanner")).toHaveCount(0);
});

test("the in-app scanner opens a label, and refuses a code that is not an ICCI label", async ({ page }, info) => {
  await fakeCameraAndReader(page);
  await signIn(page, "/scan");
  const scanner = page.getByTestId("camera-scanner");
  await expect(scanner).toBeVisible();
  await scanner.getByRole("button", { name: "Start the camera" }).click();
  await expect(scanner.getByRole("button", { name: "Stop the camera" })).toBeVisible();

  // A code that is not an ICCI label is never followed.
  await page.evaluate(() => {
    (window as unknown as { __code: string }).__code = "https://example.test/somewhere-else";
  });
  await expect(scanner.getByRole("status")).toHaveText(/not an ICCI label/);
  await expect(page).toHaveURL(/\/scan$/);
  await shot(page, "scanner-not-a-label", info.project.name, "ui-7");

  // A printed label: the item opens and the camera is switched off.
  await page.evaluate(() => {
    (window as unknown as { __code: string }).__code = "https://anything.test/l/ICCI-000001";
  });
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/Open a Label/);
  await expect(page.getByText("ICCI-000001").first()).toBeVisible();
  // The camera was switched off as soon as the label was read.
  const stillOn = await page.evaluate(() =>
    ((window as unknown as { __stream?: MediaStream }).__stream?.getTracks() ?? []).some((t) => t.readyState !== "ended"),
  );
  expect(stillOn).toBe(false);
});

// Owner's report, 21 Nov 2026: "when I was going through stocktake to scan,
// the camera doesn't open". The stocktake screen now has the in-app camera;
// a label it reads opens in the stocktake, ready to record.
test("the stocktake screen has the in-app camera, and a scanned label opens in the stocktake", async ({ page }, info) => {
  const { apiAs } = await import("./helpers");
  const admin = await apiAs(centre.email);
  const { data: building } = await admin.from("locations").select("id").eq("name", "Test Building A").single();
  const room = await admin
    .from("locations")
    .insert({ name: `Test run ${Date.now().toString(36)} ${info.project.name} camera room`, kind: "room", parent_id: building!.id })
    .select("id")
    .single();
  if (room.error) throw room.error;
  const st = await admin.from("stocktakes").insert({ location_id: room.data.id }).select("id").single();
  if (st.error) throw st.error;

  await fakeCameraAndReader(page);
  await signIn(page, `/stocktake/${st.data.id}`);
  const camera = page.getByTestId("stocktake-camera");
  await expect(camera).toBeVisible();
  await camera.getByRole("button", { name: "Start the camera" }).click();
  await expect(camera.getByRole("button", { name: "Stop the camera" })).toBeVisible();
  await shot(page, "stocktake-camera", info.project.name, "p1-21");
  await page.evaluate(() => {
    (window as unknown as { __code: string }).__code = "https://anything.test/l/ICCI-000001";
  });
  await expect(page).toHaveURL(new RegExp(`/stocktake/${st.data.id}/scan[?]label=ICCI-000001$`));
});
