// Prayer times (slice P3.1): the Centre's timetable typed in a month at a
// time, for the rota to use. Never calculated. Any day can be corrected; the
// audit log keeps every change. Super Admin and Centre Admin only. Designed
// for a PC first; on a phone the grid scrolls sideways inside its box.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Notice, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  fullDayLabel,
  isFriday,
  MAY_SEE_ROTA,
  monthDays,
  monthTitle,
  PRAYER_DAY_COLUMNS,
  readMonth,
  shiftMonth,
  shortDayLabel,
  showSampleNote,
  toDayTimes,
  type PrayerDay,
} from "@/lib/rota/rules";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { CannotSeeRota } from "../cannot-see";
import { MonthForm, type GridDay } from "./month-form";

export const metadata: Metadata = { title: "Prayer times | ICCI Control Dashboard" };

export default function PrayerTimesPage(props: PageProps<"/rota/prayer-times">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <PageHeader
        title="Prayer Times"
        subtitle="Typed in from the Centre's timetable, a month at a time. The rota takes each prayer's time from here."
      />
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function Content({ searchParams }: { searchParams: PageProps<"/rota/prayer-times">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) return <CannotSeeRota />;
  const params = await searchParams;
  const today = todayInDublin();
  const month = readMonth(params.month, today);
  const dates = monthDays(month);

  const supabase = await createClient();
  const { data } = await supabase.from("prayer_times").select(PRAYER_DAY_COLUMNS).gte("prayer_date", dates[0]).lte("prayer_date", dates.at(-1)!);
  const saved = new Map(((data ?? []) as PrayerDay[]).map((r) => [r.prayer_date, toDayTimes(r)]));
  const days: GridDay[] = dates.map((date) => ({
    date,
    short: shortDayLabel(date),
    full: fullDayLabel(date),
    friday: isFriday(date),
    today: date === today,
    saved: saved.get(date) ?? null,
  }));

  const added = Number(params.added) || 0;
  const changed = Number(params.changed) || 0;
  const link = "inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green hover:bg-icci-green-50";

  return (
    <>
      {params.done === "saved" && (
        <Notice tone="success" testId="notice">
          {added === 0 && changed === 0
            ? "Nothing had changed, so nothing new was saved."
            : `Saved: ${plural(added, "day")} added, ${plural(changed, "day")} corrected. Every change is kept in the audit log.`}
        </Notice>
      )}
      {showSampleNote(process.env.ICCI_ENVIRONMENT) && (
        <div className="mt-3">
          <Notice tone="warning" title="Made-up times" testId="sample-note">
            This is the development copy. The times here are sample times, not the Centre&rsquo;s timetable.
          </Notice>
        </div>
      )}

      <nav aria-label="Choose the month" className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link className={link} href={`/rota/prayer-times?month=${shiftMonth(month, -1)}`}>
          ← {monthTitle(shiftMonth(month, -1))}
        </Link>
        <h2 className="text-xl font-bold text-icci-green-dark" data-testid="month-title">
          {monthTitle(month)}
        </h2>
        <Link className={link} href={`/rota/prayer-times?month=${shiftMonth(month, 1)}`}>
          {monthTitle(shiftMonth(month, 1))} →
        </Link>
      </nav>
      <p className="mt-2 text-center text-sm text-icci-ink-60" data-testid="days-entered">
        {saved.size === dates.length ? "Every day of this month is entered." : `${saved.size} of ${dates.length} days entered.`}
      </p>

      <MonthForm month={month} days={days} />
      <p className="mt-4 text-sm">
        Times are never deleted. A wrong time can be corrected at any time, past days included; the audit log keeps the old one.
      </p>
    </>
  );
}
