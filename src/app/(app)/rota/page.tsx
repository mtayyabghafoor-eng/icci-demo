// Rota week (slice P3.2): one week of slots, Monday to Sunday, in four groups
// (prayers, Jumu'ah, shifts, on call). Click a slot to put someone on it.
// Warnings about the person (double-booking, Garda vetting) sit beside the
// slot in words, amber or red; they never block. E3: a missing prayer time
// is said once at the top ("Prayer times missing for 5 days"), and an empty
// slot is a dashed outline with "+ Fill", so colour means a person problem. A week is locked once
// its Sunday has passed. Slice P3.3: "Publish" opens the Publish page; once
// published, slots changed since then are amber with the word "Changed".
// Slice P3.4: "Use a template" while nobody is on the week yet. On a PC the days are columns; on a phone they are
// listed one below the other. Super Admin and Centre Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Copy, TriangleAlert } from "lucide-react";
import { Suspense } from "react";
import { buttonClass, CannotSee, Card, EmptyState, LinkButton, Notice, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { fullDayLabel, MAY_SEE_ROTA, shortDayLabel, SLOT_GROUP_LABEL, SLOT_GROUPS, type SlotType } from "@/lib/rota/rules";
import { personWarnings, readWeek, shiftWeek, timeText, WEEK_STATUS, warningText, warningTone, weekDays, weekEnded, weekStartOf, weekTitle, type RotaWarning } from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/lib/ui/text";
import { todayInDublin } from "@/lib/vetting/rules";
import { adminNames } from "../stock/data";
import { changesSentence, publishedAtText } from "@/lib/rota/publish";
import { loadPlaces, loadPublishState, loadSlotTypes, loadWeek, peopleNames, type PublishState, type RotaEntry } from "./week-data";
import { RotaNotes } from "./notes";
import { copyLastWeek, startWeek } from "./week-actions";

export const metadata: Metadata = { title: "Rota week | ICCI Control Dashboard" };

const DONE: Record<string, { text: string; tone: "success" | "error" }> = {
  started: { text: "Week started. Each prayer has an empty slot every day, and Jumu'ah on Friday. Use a template to add the shifts and on call.", tone: "success" },
  assigned: { text: "Saved. The person is on the slot.", tone: "success" },
  "taken-off": { text: "Taken off. The slot is empty again.", tone: "success" },
  removed: { text: "Slot removed from the week.", tone: "success" },
  added: { text: "Slot added.", tone: "success" },
  ended: { text: "That week has ended. Its rota can no longer be changed.", tone: "error" },
  "not-allowed": { text: "Your account is not allowed to do this.", tone: "error" },
  other: { text: "That could not be saved. Please try again.", tone: "error" },
  "copy-none": { text: "Nothing to copy: last week had nobody on the same slots. Use a template, or put people on by hand.", tone: "error" },
  "copy-not-empty": { text: "Someone is already on this week, so last week's people were not copied (names already given are never changed).", tone: "error" },
};

export default function RotaWeekPage(props: PageProps<"/rota">) {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type Ctx = {
  types: Map<string, SlotType>;
  names: Map<string, string>;
  places: Map<string, string>;
  warnings: Map<number, RotaWarning[]>;
  byId: Map<number, RotaEntry>;
  changed: Set<number>;
  ended: boolean;
};

async function Content({ searchParams }: { searchParams: PageProps<"/rota">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="Rota Week" />
        <CannotSee area="rota" />
      </>
    );
  }
  const params = await searchParams;
  const today = todayInDublin();
  const monday = readWeek(params.week, today);
  const ended = weekEnded(monday, today);
  const supabase = await createClient();
  const loaded = await loadWeek(supabase, monday);
  const publishing: PublishState | null = loaded ? await loadPublishState(supabase, loaded.week.id) : null;
  const nameOf = publishing?.latest ? await adminNames(supabase) : null;
  const added = typeof params.count === "string" && /^\d+$/.test(params.count) ? Number(params.count) : null;
  const done =
    params.done === "assigned-more"
      ? assignedMoreNotice(added ?? 0, typeof params.failed === "string" && /^\d+$/.test(params.failed) ? Number(params.failed) : 0)
      : params.done === "copied"
      ? copiedNotice(added ?? 0, typeof params.failed === "string" && /^\d+$/.test(params.failed) ? Number(params.failed) : 0)
      : params.done === "template"
      ? { text: `Template used: ${added ?? "the"} empty ${added === 1 ? "slot" : "slots"} added. Click each slot to put a person on it.`, tone: "success" as const }
      : typeof params.done === "string"
        ? DONE[params.done]
        : undefined;
  const nobodyOn = loaded ? loaded.entries.every((e) => !e.person_id) : false;
  const nav = "inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green hover:bg-icci-green-50";

  const header = (
    <PageHeader
      title="Rota Week"
      subtitle={<span data-testid="week-title">{weekTitle(monday)}</span>}
      status={
        loaded ? (
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...WEEK_STATUS[loaded.week.status]} />
            {ended && <StatusBadge word="Ended: locked" tone="grey" />}
          </span>
        ) : undefined
      }
      actions={
        loaded ? (
          <>
            {!ended && nobodyOn && (
              <LinkButton kind="outline" href={`/rota/use-template?week=${monday}`}>
                Use a template
              </LinkButton>
            )}
            {/* D5 (owner, 27 Nov 2026): last week's people onto this week's empty slots. */}
            {!ended && nobodyOn && loaded.entries.length > 0 && (
              <form action={copyLastWeek.bind(null, monday)}>
                <button type="submit" className={buttonClass("outline")}>
                  <Copy aria-hidden size={18} />
                  Copy last week&rsquo;s people
                </button>
              </form>
            )}
            {!ended && (
              <LinkButton kind="outline" href={`/rota/add?week=${monday}`}>
                Add a slot
              </LinkButton>
            )}
            {publishing?.latest && (
              <LinkButton kind="outline" href={`/rota/print/${publishing.latest.id}`}>
                Print the published rota
              </LinkButton>
            )}
            {!ended && <LinkButton href={`/rota/publish?week=${monday}`}>{publishing?.latest ? "Publish again" : "Publish"}</LinkButton>}
          </>
        ) : undefined
      }
    />
  );
  const weekNav = (
    <nav aria-label="Choose the week" className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Link className={nav} href={`/rota?week=${shiftWeek(monday, -1)}`}>
        ← Previous week
      </Link>
      {monday !== weekStartOf(today) && (
        <Link className={nav} href="/rota">
          This week
        </Link>
      )}
      {/* D5: jump straight to a week ahead (Ramadan, Eid) instead of pressing Next ten times. */}
      <form method="get" action="/rota" className="flex items-center gap-2">
        <label htmlFor="go-to-date" className="text-sm font-semibold text-icci-ink-60">
          Go to
        </label>
        <input id="go-to-date" type="date" name="week" defaultValue={monday} className="min-h-11 rounded-xl border border-icci-field bg-white px-3" />
        <button type="submit" className={buttonClass("outline")}>
          Show
        </button>
      </form>
      <Link className={nav} href={`/rota?week=${shiftWeek(monday, 1)}`}>
        Next week →
      </Link>
    </nav>
  );

  if (!loaded) {
    return (
      <>
        {header}
        {done && <Notice tone={done.tone} floating testId="notice">{done.text}</Notice>}
        {weekNav}
        <EmptyState
          icon={TriangleAlert}
          title={ended ? "No rota was made for this week." : "This week has no rota yet."}
          action={
            !ended && (
              <form action={startWeek.bind(null, monday)}>
                <button type="submit" className={buttonClass("primary")}>
                  Start this week&rsquo;s rota
                </button>
              </form>
            )
          }
        >
          {!ended && "It starts with an empty slot for each prayer every day, and Jumu'ah on Friday. Then use a template to add the shifts and on call, or add them by hand."}
        </EmptyState>
      </>
    );
  }

  const { entries, warnings: allWarnings } = loaded;
  // E3: only problems with a person are counted and shown beside a slot.
  const warnings = personWarnings(allWarnings);
  const [types, names, placeList] = await Promise.all([
    loadSlotTypes(supabase),
    peopleNames(supabase, entries.flatMap((e) => (e.person_id ? [e.person_id] : []))),
    loadPlaces(supabase, entries.flatMap((e) => (e.location_id ? [e.location_id] : []))),
  ]);
  const ctx: Ctx = {
    types: new Map(types.map((t) => [t.id, t])),
    names,
    places: new Map(placeList.map((p) => [p.id, p.label])),
    warnings: new Map(),
    byId: new Map(entries.map((e) => [e.id, e])),
    changed: publishing?.changed ?? new Set(),
    ended,
  };
  for (const w of warnings) ctx.warnings.set(w.assignment_id, [...(ctx.warnings.get(w.assignment_id) ?? []), w]);
  const days = weekDays(monday);
  const filled = entries.filter((e) => e.person_id).length;
  // Rows: the slot types used this week, in the screen's order.
  const used = types.filter((t) => entries.some((e) => e.slot_type_id === t.id));

  return (
    <>
      {header}
      {done && (
        <div className="mb-4">
          <Notice tone={done.tone} floating testId="notice">
            {done.text}
          </Notice>
        </div>
      )}
      {weekNav}
      {ended && (
        <div className="mb-4">
          <Notice tone="info">This week has ended, so its rota is locked. It shows who was on each slot.</Notice>
        </div>
      )}
      <p className="mb-4 text-[15px] text-icci-ink-60" data-testid="week-summary">
        {filled} of {entries.length} slots filled · {warnings.length === 0 ? "no problems with people" : `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"} about people`}
        {warnings.length > 0 && " (shown beside each slot; they do not stop anything)"}
      </p>
      <RotaNotes warnings={ended ? [] : allWarnings} showTemplateNote={!ended && !nobodyOn} />
      {publishing?.latest && nameOf && (
        <p className="-mt-2 mb-4 text-[15px] text-icci-ink-60" data-testid="published-line">
          Published {publishedAtText(publishing.latest.published_at)} by {nameOf(publishing.latest.published_by)}
          {publishing.count > 1 && ` (${publishing.count} times)`}. {changesSentence(publishing.changed.size, publishing.removed)}
          {publishing.changed.size > 0 && " Changed slots are marked in amber."}
        </p>
      )}

      {/* PC: one column per day. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-icci-line bg-white shadow-card md:block" data-testid="week-grid">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-28" />
            {days.map((d) => (
              <col key={d} />
            ))}
          </colgroup>
          <thead className="bg-icci-green-50 text-[13px] font-semibold uppercase tracking-wide text-icci-green-dark">
            <tr>
              <th scope="col" className="px-2 py-3">
                Slot
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className={cx("px-2 py-3", d === today && "text-icci-green")} title={fullDayLabel(d)}>
                  {shortDayLabel(d)}
                  {d === today && <span className="block text-[13px] normal-case">Today</span>}
                </th>
              ))}
            </tr>
          </thead>
          {SLOT_GROUPS.map((g) => {
            const rows = used.filter((t) => t.slot_group === g);
            if (rows.length === 0) return null;
            return (
              <tbody key={g}>
                <tr className="border-t border-icci-line bg-icci-gold-100/50">
                  <th colSpan={8} scope="rowgroup" className="px-2 py-2 text-sm font-bold text-icci-green-dark">
                    {SLOT_GROUP_LABEL[g]}
                  </th>
                </tr>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t border-icci-line align-top">
                    <th scope="row" className="px-2 py-2 text-sm font-semibold" dir="auto">
                      {t.name}
                    </th>
                    {days.map((d) => (
                      <td key={d} className="px-1 py-1.5">
                        <div className="flex flex-col gap-1.5">
                          {entries
                            .filter((e) => e.slot_type_id === t.id && e.assignment_date === d)
                            .map((e) => (
                              <SlotCard key={e.id} e={e} ctx={ctx} compact />
                            ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      {/* D5: phone day tabs, so today is one tap away instead of a long scroll. */}
      <nav aria-label="Days of this week" className="sticky top-14 z-10 -mx-4 mb-3 flex gap-1.5 overflow-x-auto bg-icci-page/95 px-4 py-2 backdrop-blur md:hidden" data-testid="day-tabs">
        {days.map((d) => (
          <a
            key={d}
            href={`#day-${d}`}
            className={cx(
              "flex min-h-11 min-w-12 flex-col items-center justify-center rounded-xl border px-2.5 text-[13px] font-semibold leading-tight no-underline",
              d === today ? "border-icci-green-dark bg-icci-green-dark text-white!" : "border-icci-line bg-white text-icci-green-dark!",
            )}
          >
            {shortDayLabel(d)}
          </a>
        ))}
      </nav>

      {/* Phone: the days one below the other. */}
      <div className="space-y-4 md:hidden" data-testid="week-list">
        {days.map((d) => {
          const ofDay = entries.filter((e) => e.assignment_date === d);
          return (
            <Card key={d} padded={false} className="scroll-mt-32 p-4">
              <span id={`day-${d}`} className="block scroll-mt-32" />
              <h2 className="text-lg font-bold text-icci-green-dark">
                {fullDayLabel(d)}
                {d === today && <span className="ml-2 text-xs font-bold uppercase text-icci-green">Today</span>}
              </h2>
              {ofDay.length === 0 && <p className="mt-2 text-icci-ink-60">Nothing on this day.</p>}
              {SLOT_GROUPS.map((g) => {
                const inGroup = used.filter((t) => t.slot_group === g).flatMap((t) => ofDay.filter((e) => e.slot_type_id === t.id));
                if (inGroup.length === 0) return null;
                return (
                  <div key={g} className="mt-3">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wide text-icci-ink-60">{SLOT_GROUP_LABEL[g]}</h3>
                    <div className="mt-1.5 flex flex-col gap-2">
                      {inGroup.map((e) => (
                        <SlotCard key={e.id} e={e} ctx={ctx} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </Card>
          );
        })}
      </div>
    </>
  );
}

/** A7: after "Also put this person on" other days. */
function copiedNotice(saved: number, failed: number): { text: string; tone: "success" | "error" } {
  const slots = (n: number) => `${n} ${n === 1 ? "slot" : "slots"}`;
  if (failed === 0) return { text: `Last week's people copied onto ${slots(saved)}. Check the warnings, then publish.`, tone: "success" };
  return { text: `Copied onto ${slots(saved)}; ${failed} could not be saved. Check those slots.`, tone: "error" };
}

function assignedMoreNotice(saved: number, failed: number): { text: string; tone: "success" | "error" } {
  const days = (n: number) => `${n} more ${n === 1 ? "day" : "days"}`;
  if (failed === 0) return { text: `Saved. The person is on ${days(saved)} too.`, tone: "success" };
  return { text: `Put on ${days(saved)}; ${failed} could not be saved (the slot changed or the week ended). Check those days.`, tone: "error" };
}

function describe(e: RotaEntry | undefined, ctx: Ctx): string | undefined {
  if (!e) return undefined;
  const t = ctx.types.get(e.slot_type_id);
  return `${t?.name ?? "another slot"} at ${timeText(e.slot_group, e.starts_at, e.ends_at)}`;
}

function SlotCard({ e, ctx, compact = false }: { e: RotaEntry; ctx: Ctx; compact?: boolean }) {
  const type = ctx.types.get(e.slot_type_id);
  const ws = ctx.warnings.get(e.id) ?? [];
  const worst = ws.some((w) => warningTone(w.kind) === "red") ? "red" : ws.length ? "amber" : null;
  const person = e.person_id ? ctx.names.get(e.person_id) : null;
  const changed = ctx.changed.has(e.id);
  return (
    <Link
      href={`/rota/slot/${e.id}`}
      data-testid="rota-slot"
      data-slot-id={e.id}
      data-date={e.assignment_date}
      data-changed={changed ? "yes" : undefined}
      aria-label={`${type?.name ?? "Slot"} on ${fullDayLabel(e.assignment_date)}: ${person ?? "not filled yet"}${changed ? ", changed since publishing" : ""}${ws.length ? `, ${ws.length} ${ws.length === 1 ? "warning" : "warnings"}` : ""}`}
      className={cx(
        "block rounded-lg border px-2 py-1.5 text-sm text-icci-text no-underline transition-colors hover:border-icci-green hover:bg-icci-green-50",
        worst === "red"
          ? "border-icci-error/60 bg-[var(--icci-bad-fill)]"
          : worst === "amber"
            ? "border-[var(--icci-warn-text)]/40 bg-[var(--icci-warn-fill)]"
            : person
              ? "border-icci-line bg-white"
              : // D5: an empty slot looks empty, not like a filled one.
                "border-dashed border-icci-field/70 bg-transparent",
      )}
    >
      {changed && (
        <span data-testid="slot-changed" className="mb-0.5 inline-block rounded bg-[var(--icci-warn-fill)] px-1.5 text-[12.5px] font-bold uppercase tracking-wide text-[var(--icci-warn-text)] ring-1 ring-[var(--icci-warn-text)]/40">
          Changed
        </span>
      )}
      {!compact && <span className="block font-semibold text-icci-green-dark">{type?.name}</span>}
      <span className={cx("block font-semibold", !person && "font-semibold text-icci-green")} dir="auto" data-testid="slot-person">
        {person ?? (ctx.ended ? "Nobody" : "+ Fill")}
      </span>
      {/* E3: a prayer with no time says nothing here; the notice at the top says it once. */}
      {(e.starts_at || (e.slot_group !== "prayer" && e.slot_group !== "jumuah")) && (
        <span className="block text-[13px] text-icci-ink-60">{timeText(e.slot_group, e.starts_at, e.ends_at)}</span>
      )}
      {e.location_id && <span className="block text-[13px] text-icci-ink-60">{ctx.places.get(e.location_id)}</span>}
      {ws.map((w, i) => {
        const red = warningTone(w.kind) === "red";
        const Icon = red ? CircleAlert : TriangleAlert;
        return (
          <span
            key={i}
            data-testid="slot-warning"
            className={cx("mt-1 flex items-start gap-1 text-[13px] font-semibold leading-snug", red ? "text-icci-error" : "text-[var(--icci-warn-text)]")}
          >
            <Icon aria-hidden size={14} className="mt-0.5 shrink-0" />
            {warningText(w, describe(w.other_assignment_id ? ctx.byId.get(w.other_assignment_id) : undefined, ctx))}
          </span>
        );
      })}
    </Link>
  );
}
