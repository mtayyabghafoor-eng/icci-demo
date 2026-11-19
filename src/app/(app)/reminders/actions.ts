"use server";
// The Super Admin's two buttons on the reminders screen (slice P2.9).
// "Run today's reminders" does what the daily timer does, as the signed-in
// Super Admin; the database refuses anyone else. "Send a test email" sends
// one example to the project mailbox only, and records nothing as sent.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { emailSettings, runAndDeliver, sendEmail } from "@/lib/reminders/deliver";
import { buildReminderEmail, emailServiceReady, emailTitle, MAY_RUN_REMINDERS, reminderStage, type ReminderItem } from "@/lib/reminders/rules";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, todayInDublin } from "@/lib/vetting/rules";

export async function runRemindersNow(): Promise<void> {
  const me = await requireAdmin();
  if (!MAY_RUN_REMINDERS.includes(me.roleCode)) redirect("/reminders?done=not-allowed");
  let done = "failed";
  let count = 0;
  try {
    const { run } = await runAndDeliver(await createClient(), null);
    count = run.items.length;
    done = count > 0 ? "ran" : "quiet";
  } catch {
    done = "failed";
  }
  redirect(`/reminders?done=${done}${count ? `&n=${count}` : ""}`);
}

type RegisterRow = { source: string; record_id: string; title: string; category: string; due_on: string | null; status: string };

export async function sendTestEmail(): Promise<void> {
  const me = await requireAdmin();
  if (!MAY_RUN_REMINDERS.includes(me.roleCode)) redirect("/reminders?done=not-allowed");
  const settings = emailSettings();
  const to = process.env.REMINDER_TEST_TO?.trim();
  if (!emailServiceReady(settings) || !to) redirect("/reminders?done=test-not-set-up");

  // What would be in a reminder today: everything 60 days or fewer from its due date.
  const supabase = await createClient();
  const { data } = await supabase
    .from("renewals_register")
    .select("source, record_id, title, category, due_on, status")
    .in("status", ["due", "ok"])
    .not("due_on", "is", null)
    .order("due_on")
    .limit(200);
  const today = todayInDublin();
  const items: ReminderItem[] = ((data ?? []) as RegisterRow[]).flatMap((r) => {
    const days = daysBetween(today, r.due_on!);
    const stage = reminderStage(days);
    return stage ? [{ source: r.source, record_id: r.record_id, title: emailTitle(r.source, r.title), category: r.category, due_on: r.due_on!, stage, days_left: days }] : [];
  });

  const email = buildReminderEmail(items, process.env.SITE_URL, { test: true });
  const sent = await sendEmail(settings, { to: to!, ...email });
  redirect(`/reminders?done=${sent.ok ? "test-sent" : "test-failed"}`);
}
