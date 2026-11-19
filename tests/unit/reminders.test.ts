// Slice P2.9: the plain rules around email reminders. The database decides
// what is due (tests/db/reminders.test.ts); these check the email's wording,
// when an email may really leave, and the timer's key check.
import { describe, expect, it } from "vitest";
import { decideRoute, REMINDER_TIMER_PATH } from "@/lib/auth/rules";
import {
  bearerKey,
  buildReminderEmail,
  deliveryDecision,
  emailServiceReady,
  emailTitle,
  reminderStage,
  sameSecret,
  type ReminderItem,
} from "@/lib/reminders/rules";

const item = (title: string, stage: 7 | 30 | 60, days_left: number, due_on: string): ReminderItem => ({
  source: "manual",
  record_id: "00000000-0000-4000-8000-000000000000",
  title,
  category: "Insurance",
  due_on,
  stage,
  days_left,
});

describe("the reminder stages", () => {
  it.each([
    [-1, null],
    [0, 7],
    [7, 7],
    [8, 30],
    [30, 30],
    [31, 60],
    [60, 60],
    [61, null],
  ])("%i days left: %s", (days, stage) => {
    expect(reminderStage(days)).toBe(stage);
  });
});

describe("the email", () => {
  const items = [
    item("Test building insurance (made up)", 60, 45, "2027-01-01"),
    item("Test lift inspection (made up)", 7, 1, "2026-11-18"),
    item("Test music licence (made up)", 7, 0, "2026-11-17"),
  ];

  it("groups by 7, 30 and 60 days, soonest first, and links to Renewals", () => {
    const e = buildReminderEmail(items, "https://icci.example/");
    expect(e.subject).toBe("ICCI renewals: 3 reminders");
    expect(e.text.indexOf("Due within 7 days")).toBeLessThan(e.text.indexOf("Due within 60 days"));
    expect(e.text).not.toContain("Due within 30 days");
    expect(e.text).toContain("- Test lift inspection (made up) (Insurance): 18 Nov 2026, in 1 day");
    expect(e.text).toContain("due today");
    expect(e.text).toContain("https://icci.example/renewals");
    expect(e.html).toContain('href="https://icci.example/renewals"');
  });

  it("without the site's address, says where to go instead", () => {
    const e = buildReminderEmail([items[0]]);
    expect(e.subject).toBe("ICCI renewals: 1 reminder");
    expect(e.text).toContain("Open the ICCI Control Dashboard and choose Renewals.");
  });

  it("a test email says so in the subject and the text", () => {
    const e = buildReminderEmail(items, undefined, { test: true });
    expect(e.subject).toMatch(/^\[Test\] /);
    expect(e.text).toMatch(/This is a test email/);
  });

  it("typed-in titles cannot add anything to the email's layout", () => {
    const e = buildReminderEmail([item('<a href="x">Test</a> & co', 30, 20, "2026-12-07")]);
    expect(e.html).not.toContain('<a href="x">');
    expect(e.html).toContain("&lt;a href=&quot;x&quot;&gt;Test&lt;/a&gt; &amp; co");
  });

  it("never names a person for a vetting renewal", () => {
    expect(emailTitle("vetting", "Garda vetting: Test Hamza Example")).toBe("Garda vetting for 1 person");
    expect(emailTitle("manual", "Test building insurance")).toBe("Test building insurance");
  });
});

describe("when an email may really leave", () => {
  const ready = { environment: "staging", apiKey: "re_test_made_up", from: "ICCI <onboarding@resend.dev>" };

  it("never on the development database", () => {
    expect(deliveryDecision({ ...ready, environment: "development" }, "someone@icci.example.ie")).toMatchObject({ send: false, detail: expect.stringMatching(/Development/) });
  });
  it("never without the email service set up", () => {
    expect(emailServiceReady({ environment: "staging" })).toBe(false);
    expect(deliveryDecision({ ...ready, apiKey: "" }, "someone@icci.ie")).toMatchObject({ send: false, detail: expect.stringMatching(/No email service/) });
  });
  it("never to an address that cannot receive mail", () => {
    for (const a of ["centre.admin@icci-prototype.test", "x@y.example", "x@y.invalid"]) expect(deliveryDecision(ready, a)).toMatchObject({ send: false });
  });
  it("otherwise, yes", () => {
    expect(deliveryDecision(ready, "admin@icci.ie")).toEqual({ send: true });
  });
});

describe("the timer's key", () => {
  const key = "f".repeat(64);
  it("is read from the Authorization header", () => {
    expect(bearerKey(`Bearer ${key}`)).toBe(key);
    expect(bearerKey(key)).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
  it("must match exactly; a missing or short expected key never matches", () => {
    expect(sameSecret(key, key)).toBe(true);
    expect(sameSecret(key.slice(1), key)).toBe(false);
    expect(sameSecret("e".repeat(64), key)).toBe(false);
    expect(sameSecret(null, key)).toBe(false);
    expect(sameSecret("short", "short")).toBe(false);
    expect(sameSecret(key, undefined)).toBe(false);
  });
});

describe("the sign-in gate lets only the timer's address through", () => {
  const base = { search: "", aal: null, lastActive: undefined, now: Date.now() } as const;
  it("exactly that address", () => {
    expect(decideRoute({ ...base, pathname: REMINDER_TIMER_PATH })).toEqual({ kind: "allow" });
    expect(decideRoute({ ...base, pathname: `${REMINDER_TIMER_PATH}/more` })).toMatchObject({ kind: "redirect" });
    expect(decideRoute({ ...base, pathname: "/api/reminders" })).toMatchObject({ kind: "redirect" });
    expect(decideRoute({ ...base, pathname: "/reminders" })).toMatchObject({ kind: "redirect" });
  });
});
