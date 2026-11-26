// Email reminders for the renewals register (slice P2.9). The database
// decides what is due and remembers what was sent (migration 0027); these
// are the plain rules around it: the wording of the email, when an email
// may really leave, and checking the daily timer's key.
import { timingSafeEqual } from "node:crypto";
import { formatDate } from "@/lib/items/rules";

export const STAGES = [60, 30, 7] as const;
export type Stage = (typeof STAGES)[number];

/** Who may see the reminders screen, and who may press "Run today's reminders". */
export const MAY_SEE_REMINDERS = ["super_admin", "centre_admin"];
export const MAY_RUN_REMINDERS = ["super_admin"];

/** Which reminder is due from the days left (same rule as the database's reminder_stage). */
export function reminderStage(daysLeft: number | null): Stage | null {
  if (daysLeft === null || daysLeft < 0) return null;
  if (daysLeft <= 7) return 7;
  if (daysLeft <= 30) return 30;
  if (daysLeft <= 60) return 60;
  return null;
}

export type ReminderItem = {
  source: string;
  record_id: string;
  title: string;
  category: string;
  due_on: string;
  stage: Stage;
  days_left: number;
};
/** retry (0055): reminders from this admin's earlier emails that failed to send. */
export type Recipient = { id: string; name: string; email: string; retry?: ReminderItem[] };
export type RunResult = {
  run_id: number;
  run_on: string;
  trigger: "timer" | "button";
  items: ReminderItem[];
  recipients: Recipient[];
};

/** People's names never go into an email. */
export function emailTitle(source: string, title: string): string {
  return source === "vetting" ? "Garda vetting for 1 person" : title;
}

export const STAGE_HEADING: Record<Stage, string> = {
  7: "Due within 7 days",
  30: "Due within 30 days",
  60: "Due within 60 days",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function whenLine(days: number): string {
  if (days === 0) return "due today";
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * One admin's reminders (Round C4): today's new ones, then any from their
 * earlier failed emails, each once, earliest due first.
 */
export function itemsFor(items: ReminderItem[], retry: ReminderItem[] = []): { items: ReminderItem[]; retried: number } {
  const key = (i: ReminderItem) => `${i.source}|${i.record_id}|${i.due_on}|${i.stage}`;
  const seen = new Set(items.map(key));
  const extra = retry.filter((i) => !seen.has(key(i)) && (seen.add(key(i)), true));
  const all = [...items, ...extra].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title));
  return { items: all, retried: extra.length };
}

/** The daily summary email: grouped 7, 30, 60 days; a link to Renewals when the site address is known. */
export function buildReminderEmail(items: ReminderItem[], siteUrl?: string, opts: { test?: boolean; retried?: number } = {}) {
  const n = items.length;
  const subject = `${opts.test ? "[Test] " : ""}ICCI renewals: ${n} ${n === 1 ? "reminder" : "reminders"}`;
  const link = siteUrl ? `${siteUrl.replace(/\/+$/, "")}/renewals` : null;
  const groups = ([7, 30, 60] as Stage[])
    .map((stage) => ({ stage, rows: items.filter((i) => i.stage === stage) }))
    .filter((g) => g.rows.length > 0);

  const intro = opts.test
    ? "This is a test email from the ICCI Control Dashboard. It shows what a daily reminder looks like, using what is in the register now. Nothing was recorded as sent."
    : "These renewals have just reached a reminder point. Each one is reminded at 60, 30 and 7 days before it is due." +
      (opts.retried ? ` ${opts.retried === 1 ? "One of them was" : `${opts.retried} of them were`} in an earlier email that could not be sent, so ${opts.retried === 1 ? "it is" : "they are"} included again.` : "");
  const outro = link ? `Open the Renewals register: ${link}` : "Open the ICCI Control Dashboard and choose Renewals.";

  const text = [
    intro,
    "",
    ...groups.flatMap((g) => [
      `${STAGE_HEADING[g.stage]}:`,
      ...g.rows.map((r) => `- ${r.title} (${r.category}): ${formatDate(r.due_on)}, ${whenLine(r.days_left)}`),
      "",
    ]),
    outro,
    "",
    "Sent to Super Admins and Centre Admins. No names of people are included in these emails.",
  ].join("\n");

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    ...groups.map(
      (g) =>
        `<h3 style="margin:16px 0 4px">${STAGE_HEADING[g.stage]}</h3><ul>` +
        g.rows
          .map((r) => `<li><strong>${escapeHtml(r.title)}</strong> (${escapeHtml(r.category)}): ${formatDate(r.due_on)}, ${whenLine(r.days_left)}</li>`)
          .join("") +
        "</ul>",
    ),
    link ? `<p><a href="${escapeHtml(link)}">Open the Renewals register</a></p>` : `<p>${escapeHtml(outro)}</p>`,
    `<p style="color:#555;font-size:13px">Sent to Super Admins and Centre Admins. No names of people are included in these emails.</p>`,
  ].join("\n");

  return { subject, text, html };
}

export type EmailSettings = {
  environment?: string;
  apiKey?: string;
  from?: string;
};

/** Addresses that can never receive mail (the made-up test accounts end in .test). */
export const UNDELIVERABLE = /\.(test|example|invalid|localhost)$/i;

export function emailServiceReady(s: EmailSettings): boolean {
  return Boolean(s.apiKey?.trim() && s.from?.trim());
}

/**
 * May this reminder really be emailed? Never on the development database
 * (made-up data), never without the email service set up, never to an
 * address that cannot receive mail. Otherwise it is only recorded.
 */
export function deliveryDecision(s: EmailSettings, email: string): { send: true } | { send: false; detail: string } {
  if (s.environment === "development") return { send: false, detail: "Development: made-up data, so no email was sent." };
  if (!emailServiceReady(s)) return { send: false, detail: "No email service set up yet, so no email was sent." };
  if (UNDELIVERABLE.test(email.trim())) return { send: false, detail: "A test address that cannot receive mail, so no email was sent." };
  return { send: true };
}

/** The key from an "Authorization: Bearer …" header, or null. */
export function bearerKey(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/);
  return m ? m[1] : null;
}

/** Compares two secrets without giving away, by timing, how much matched. */
export function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || expected.length < 32) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const OUTCOME: Record<string, { word: string; tone: "green" | "grey" | "red" }> = {
  sent: { word: "Sent", tone: "green" },
  "recorded only": { word: "Recorded only", tone: "grey" },
  failed: { word: "Failed", tone: "red" },
};

export const TRIGGER_LABEL: Record<string, string> = {
  timer: "the daily timer",
  button: "the button",
};
