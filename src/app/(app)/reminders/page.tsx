// Email reminders (slice P2.9, PLAN.md 5.2): how they are set up, the Super
// Admin's two buttons, and what was sent, when and to whom. Super Admin and
// Centre Admin can see it; only a Super Admin can press the buttons.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate, formatDateTime } from "@/lib/items/rules";
import { emailSettings } from "@/lib/reminders/deliver";
import { emailServiceReady, MAY_RUN_REMINDERS, MAY_SEE_REMINDERS, OUTCOME, STAGE_HEADING, TRIGGER_LABEL, type Stage } from "@/lib/reminders/rules";
import { createClient } from "@/lib/supabase/server";
import { Notice, StatusBadge } from "../items/ui";
import { runRemindersNow, sendTestEmail } from "./actions";

export const metadata: Metadata = { title: "Email reminders | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  ran: "Reminders run. The emails are listed below.",
  quiet: "Reminders run. Nothing new has reached 60, 30 or 7 days, so no email was needed.",
  failed: "The reminders could not be run. Please try again; if it happens again, report it.",
  "test-sent": "Test email sent to the project mailbox.",
  "test-failed": "The test email could not be sent. Check the email service settings.",
  "test-not-set-up": "The email service is not set up yet, so no test email can be sent.",
  "not-allowed": "Your account is not allowed to do this.",
};

type Run = { id: number; run_on: string; trigger: string; created_by: string | null; created_at: string };
type Sent = { run_id: number; email_title: string; category: string; due_on: string; stage: Stage };
type Delivery = { run_id: number; recipient_id: string; outcome: string; detail: string | null };

export default function RemindersPage(props: PageProps<"/reminders">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <p className="text-sm">
        <Link className="back-link" href="/renewals">← Renewals</Link>
      </p>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Email reminders</h1>
      <p className="mt-2">
        Each morning, Super Admins and Centre Admins get one email listing the renewals that have just reached 60, 30 or 7 days before they are due.
        Nothing is sent on a quiet day, and the names of people are never put in an email.
      </p>
      <Suspense fallback={<p className="mt-6">Loading reminders…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/reminders">, "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_SEE_REMINDERS.includes(me.roleCode)) {
    return (
      <p className="mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3" data-testid="cannot-see-reminders">
        Your account cannot see the email reminders. Only a Super Admin or Centre Admin can.
      </p>
    );
  }
  const { done } = await searchParams;
  const supabase = await createClient();
  const { data: runData } = await supabase.from("reminder_runs").select("id, run_on, trigger, created_by, created_at").order("created_at", { ascending: false }).limit(20);
  const runs = (runData ?? []) as Run[];
  const ids = runs.map((r) => r.id);
  const [sentRes, delRes, accounts] = await Promise.all([
    ids.length ? supabase.from("reminders_sent").select("run_id, email_title, category, due_on, stage").in("run_id", ids).order("due_on") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("reminder_deliveries").select("run_id, recipient_id, outcome, detail").in("run_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("app_users").select("id, display_name"),
  ]);
  const sent = (sentRes.data ?? []) as Sent[];
  const deliveries = (delRes.data ?? []) as Delivery[];
  const name = (uid: string | null) => ((accounts.data ?? []) as { id: string; display_name: string }[]).find((a) => a.id === uid)?.display_name ?? "an admin";
  const settings = emailSettings();
  const ready = emailServiceReady(settings);
  const testReady = ready && Boolean(process.env.REMINDER_TEST_TO?.trim());
  const development = settings.environment === "development";
  const mayRun = MAY_RUN_REMINDERS.includes(me.roleCode);
  const n = (await searchParams).n;

  return (
    <>
      {typeof done === "string" && DONE[done] && (
        <div data-testid="notice">
          <Notice>
            {DONE[done]}
            {done === "ran" && typeof n === "string" ? ` ${n} ${n === "1" ? "renewal" : "renewals"} reminded.` : ""}
          </Notice>
        </div>
      )}

      <section className="mt-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="reminder-setup">
        <h2 className="text-lg font-semibold text-icci-green-dark">How it is set up</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-[11rem_1fr]">
          <dt className="text-sm font-semibold text-icci-ink-60">Email service</dt>
          <dd data-testid="email-service">{ready ? "Set up." : "Not set up yet. Reminders are worked out and recorded, but no email is sent."}</dd>
          {development && (
            <>
              <dt className="text-sm font-semibold text-icci-ink-60">This copy</dt>
              <dd>Development, with made-up data: no reminder email is ever sent from it.</dd>
            </>
          )}
          <dt className="text-sm font-semibold text-icci-ink-60">Daily timer</dt>
          <dd>Runs at about 7 in the morning once the site is online. Until then, a Super Admin can run it with the button below.</dd>
        </dl>
        {mayRun && (
          <div className="mt-4 flex flex-wrap items-start gap-3">
            <form action={runRemindersNow}>
              <button type="submit" className={buttonClass("primary")}>
                Run today&rsquo;s reminders
              </button>
            </form>
            <form action={sendTestEmail}>
              <button type="submit" disabled={!testReady} aria-describedby="test_hint" className={`${buttonClass("outline")} disabled:cursor-not-allowed disabled:opacity-60`}>
                Send a test email
              </button>
            </form>
            <p id="test_hint" className="basis-full text-sm">
              {testReady
                ? "The test email goes to the project mailbox only, and is not recorded as a reminder."
                : "The test email needs the email service and the project mailbox in the settings first."}
            </p>
          </div>
        )}
      </section>

      <section className="mt-6" data-testid="reminder-history">
        <h2 className="text-lg font-semibold text-icci-green-dark">What was sent</h2>
        {runs.length === 0 ? (
          <p className="mt-2">The reminders have not run yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {runs.map((r) => {
              const items = sent.filter((s) => s.run_id === r.id);
              const emails = deliveries.filter((d) => d.run_id === r.id);
              return (
                <li key={r.id} data-testid="reminder-run" className="rounded-2xl border border-icci-line bg-white p-4 shadow-card">
                  <p className="font-semibold">
                    {formatDateTime(r.created_at)}, by {r.trigger === "button" ? name(r.created_by) : TRIGGER_LABEL[r.trigger]}
                  </p>
                  {items.length === 0 ? (
                    <p className="text-sm" data-testid="run-quiet">
                      Nothing new to remind.
                    </p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-1">
                        {items.map((s, i) => (
                          <li key={i} data-testid="reminded-item" className="text-sm" dir="auto">
                            <span className="font-semibold">{STAGE_HEADING[s.stage]}:</span> {s.email_title} ({s.category}), due {formatDate(s.due_on)}
                          </li>
                        ))}
                      </ul>
                      <ul className="mt-3 space-y-1 border-t border-icci-panel pt-2">
                        {emails.length === 0 ? (
                          <li className="text-sm">No email recorded for this run.</li>
                        ) : (
                          emails.map((d) => (
                            <li key={d.recipient_id} data-testid="reminder-email" className="flex flex-wrap items-center gap-2 text-sm">
                              <StatusBadge {...(OUTCOME[d.outcome] ?? OUTCOME["recorded only"])} />
                              <span dir="auto">{name(d.recipient_id)}</span>
                              {d.detail && <span className="text-icci-ink-60">{d.detail}</span>}
                            </li>
                          ))
                        )}
                      </ul>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-sm">These records are never changed or deleted. The latest 20 runs are shown.</p>
      </section>
    </>
  );
}
