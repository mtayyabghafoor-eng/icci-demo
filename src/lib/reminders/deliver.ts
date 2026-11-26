// Runs today's reminders and sends the emails (slice P2.9). Used by the
// daily timer's address and by the Super Admin's button. The database picks
// what is due and refuses anyone not allowed; this sends one summary email
// per admin through the email service (Resend), only when deliveryDecision
// allows it, and writes down what happened to each email.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReminderEmail, deliveryDecision, itemsFor, type EmailSettings, type RunResult } from "./rules";

const RESEND_URL = "https://api.resend.com/emails";

export function emailSettings(): EmailSettings {
  return {
    environment: process.env.ICCI_ENVIRONMENT,
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.REMINDER_FROM,
  };
}

type Message = { to: string; subject: string; text: string; html: string };

/** One email through the email service. Never says more than a short reason on failure. */
export async function sendEmail(s: EmailSettings, m: Message): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: s.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, detail: `The email service refused it (code ${res.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, detail: "The email service could not be reached." };
  }
}

export type Outcome = { recipient_id: string; outcome: "sent" | "recorded only" | "failed"; detail: string | null };

export async function runAndDeliver(client: SupabaseClient, key: string | null): Promise<{ run: RunResult; outcomes: Outcome[] }> {
  const { data, error } = await client.rpc("run_reminders", key ? { p_key: key } : {});
  if (error) throw new Error(error.message);
  const run = data as RunResult;
  // Nothing new and no earlier failed email to send again: nobody is listed.
  if (run.recipients.length === 0) return { run, outcomes: [] };

  const settings = emailSettings();
  const outcomes: Outcome[] = [];
  for (const r of run.recipients) {
    const mine = itemsFor(run.items, r.retry);
    if (mine.items.length === 0) continue;
    const email = buildReminderEmail(mine.items, process.env.SITE_URL, { retried: mine.retried });
    const decision = deliveryDecision(settings, r.email);
    if (!decision.send) {
      outcomes.push({ recipient_id: r.id, outcome: "recorded only", detail: decision.detail });
      continue;
    }
    const sent = await sendEmail(settings, { to: r.email, ...email });
    outcomes.push(sent.ok ? { recipient_id: r.id, outcome: "sent", detail: null } : { recipient_id: r.id, outcome: "failed", detail: sent.detail });
  }

  if (outcomes.length === 0) return { run, outcomes };
  const recorded = await client.rpc("record_reminder_deliveries", {
    p_run_id: run.run_id,
    p_outcomes: outcomes,
    ...(key ? { p_key: key } : {}),
  });
  if (recorded.error) throw new Error(recorded.error.message);
  return { run, outcomes };
}
