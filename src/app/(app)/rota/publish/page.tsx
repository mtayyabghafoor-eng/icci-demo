// Publish a rota week (slice P3.3). Lists the warnings in words, asks for the
// tick "I have seen the warnings" when there are any, then publishes and
// opens the one-page rota. The database checks everything again (role, tick,
// week not ended) and freezes a copy of the rota as published. A week can be
// published again after changes; the admin who built it may publish it.
import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { Suspense } from "react";
import { buttonClass, CannotSee, Card, CardTitle, Notice, PageHeader, Skeleton, SaveBar } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { changesSentence, publishedAtText } from "@/lib/rota/publish";
import { fullDayLabel, MAY_SEE_ROTA } from "@/lib/rota/rules";
import { readWeek, timeText, warningText, warningTone, weekEnded, weekTitle } from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/lib/ui/text";
import { todayInDublin } from "@/lib/vetting/rules";
import { adminNames } from "../../stock/data";
import { loadPublishState, loadSlotTypes, loadWeek, peopleNames } from "../week-data";
import { publishWeek } from "../week-actions";

export const metadata: Metadata = { title: "Publish the rota | ICCI Control Dashboard" };

const PROBLEM: Record<string, string> = {
  tick: "This week has warnings. Tick “I have seen the warnings” to publish it.",
  ended: "That week has ended. Its rota can no longer be published.",
  "not-allowed": "Your account is not allowed to do this.",
  other: "The rota could not be published. Please try again.",
};

export default function PublishRotaPage(props: PageProps<"/rota/publish">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/rota/publish">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="Publish the Rota" />
        <CannotSee area="rota" />
      </>
    );
  }
  const params = await searchParams;
  const today = todayInDublin();
  const monday = readWeek(params.week, today);
  const back = `/rota?week=${monday}`;
  const crumbs = [{ href: back, label: weekTitle(monday) }, { label: "Publish" }];
  const problem = typeof params.problem === "string" ? PROBLEM[params.problem] : undefined;
  const supabase = await createClient();
  const loaded = await loadWeek(supabase, monday);

  if (!loaded || weekEnded(monday, today)) {
    return (
      <>
        <PageHeader title="Publish the Rota" crumbs={crumbs} />
        <Notice tone="info">{loaded ? "This week has ended, so it can no longer be published." : "This week has no rota yet. Start it first."}</Notice>
        <p className="mt-4">
          <Link href={back} className="font-semibold">
            ← Back to the week
          </Link>
        </p>
      </>
    );
  }

  const { week, entries, warnings } = loaded;
  const [types, names, state] = await Promise.all([
    loadSlotTypes(supabase),
    peopleNames(supabase, entries.flatMap((e) => (e.person_id ? [e.person_id] : []))),
    loadPublishState(supabase, week.id),
  ]);
  const nameOf = state.latest ? await adminNames(supabase) : null;
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const filled = entries.filter((e) => e.person_id).length;
  const sorted = [...warnings].sort(
    (a, b) => a.assignment_date.localeCompare(b.assignment_date) || (byId.get(a.assignment_id)?.start_min ?? 0) - (byId.get(b.assignment_id)?.start_min ?? 0),
  );
  const describe = (id: number | null) => {
    const e = id ? byId.get(id) : undefined;
    return e ? `${typeName.get(e.slot_type_id) ?? "another slot"} at ${timeText(e.slot_group, e.starts_at, e.ends_at)}` : undefined;
  };

  return (
    <>
      <PageHeader title="Publish the Rota" crumbs={crumbs} subtitle={weekTitle(monday)} />
      {problem && (
        <div className="mb-4">
          <Notice tone="error" testId="notice">
            {problem}
          </Notice>
        </div>
      )}

      <Card className="mb-4">
        <CardTitle>This week</CardTitle>
        <ul className="list-disc space-y-1 pl-5" data-testid="publish-summary">
          <li>
            {filled} of {entries.length} slots filled{entries.length - filled > 0 && `; ${entries.length - filled} will print as “Not filled yet”`}.
          </li>
          <li>
            {state.latest && nameOf
              ? `Last published ${publishedAtText(state.latest.published_at)} by ${nameOf(state.latest.published_by)}. ${changesSentence(state.changed.size, state.removed)}`
              : "Not published yet. This will be the first publication."}
          </li>
          {state.latest && <li>Changed slots print in amber with the word &ldquo;Changed&rdquo;.</li>}
          <li>The one-page rota shows names and roles only, never phone numbers.</li>
        </ul>
      </Card>

      <Card className="mb-4">
        <CardTitle>{warnings.length === 0 ? "No warnings" : `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`}</CardTitle>
        {warnings.length === 0 ? (
          <p>Nothing to check. Nobody is double-booked, everyone who needs Garda vetting has it, and every prayer has its time.</p>
        ) : (
          <>
            <p className="mb-3">Warnings do not stop publishing. Check them, then tick the box below.</p>
            <ul dir="auto" className="divide-y divide-icci-line" data-testid="publish-warnings">
              {sorted.map((w, i) => {
                const e = byId.get(w.assignment_id);
                const red = warningTone(w.kind) === "red";
                const Icon = red ? CircleAlert : TriangleAlert;
                return (
                  <li key={i} className="flex items-start gap-2 py-2">
                    <Icon aria-hidden size={18} className={cx("mt-0.5 shrink-0", red ? "text-icci-error" : "text-[var(--icci-warn-text)]")} />
                    <span>
                      <Link dir="auto" href={`/rota/slot/${w.assignment_id}`} className="font-semibold">
                        {e ? `${typeName.get(e.slot_type_id)}, ${fullDayLabel(e.assignment_date)}` : fullDayLabel(w.assignment_date)}
                      </Link>
                      {w.person_id && names.get(w.person_id) && <span dir="auto">: {names.get(w.person_id)}</span>}
                      <span className={cx("block text-[15px]", red ? "text-icci-error" : "text-[var(--icci-warn-text)]")}>
                        {warningText(w, describe(w.other_assignment_id))}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <form action={publishWeek.bind(null, week.id, monday)} className="flex flex-col gap-4">
        {warnings.length > 0 && (
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-[var(--icci-warn-text)]/40 bg-[var(--icci-warn-fill)] p-4">
            <input type="checkbox" name="seen_warnings" value="yes" required className="mt-1 size-5 shrink-0 accent-icci-green" />
            <span className="font-semibold">I have seen the warnings and still want to publish this week.</span>
          </label>
        )}
        <SaveBar cancelHref={back}>
          <button type="submit" className={buttonClass("primary")}>
            {state.latest ? "Publish again and print" : "Publish and print"}
          </button>
      </SaveBar>
      </form>
    </>
  );
}
