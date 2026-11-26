// The one-page rota (slice P3.3): one publication of a week, ready to print
// on A4 landscape. "Save as PDF" in the browser's print window makes the
// file, the same way label sheets work, so no new add-on. It prints the copy
// frozen when the week was published, so it never changes afterwards. Slots
// changed since the publication before are amber with the word "Changed";
// slots taken off are listed under the grid. Names and roles only, never
// phone numbers (owner's choice, 15 Nov 2026).
import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink, CannotSee, Logo, Notice, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { changesSentence, personText, printRows, PUBLICATION_COLUMNS, publishedAtText, removedText, type FrozenEntry, type Publication } from "@/lib/rota/publish";
import { fullDayLabel, MAY_SEE_ROTA, shortDayLabel, SLOT_GROUP_LABEL } from "@/lib/rota/rules";
import { timeText, weekDays, weekTitle } from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/lib/ui/text";
import { PrintNowButton } from "../../../labels/forms";
import { adminNames } from "../../../stock/data";
import { loadPublishState } from "../../week-data";
import Link from "next/link";

export const metadata: Metadata = { title: "Rota (print) | ICCI Control Dashboard" };

export default function RotaPrintPage(props: PageProps<"/rota/print/[id]">) {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 print:m-0 print:max-w-none print:p-0">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: { params: PageProps<"/rota/print/[id]">["params"]; searchParams: PageProps<"/rota/print/[id]">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) return <CannotSee area="rota" />;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const pubId = /^\d{1,12}$/.test(id) ? Number(id) : null;
  const supabase = await createClient();
  const { data } = pubId ? await supabase.from("rota_publications").select(PUBLICATION_COLUMNS).eq("id", pubId).maybeSingle() : { data: null };
  const pub = data as Publication | null;

  if (!pub) {
    return (
      <>
        <BackLink href="/rota">Rota week</BackLink>
        <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Published Rota</h1>
        <p className="mt-4">This published rota could not be found.</p>
      </>
    );
  }

  const copy = pub.frozen_copy;
  const monday = copy.week_start;
  const days = weekDays(monday);
  const [nameOf, versions] = await Promise.all([
    adminNames(supabase),
    supabase.from("rota_publications").select("id").eq("week_id", pub.week_id).order("published_at").order("id"),
  ]);
  const order = ((versions.data ?? []) as { id: number }[]).map((v) => v.id);
  const version = order.indexOf(pub.id) + 1;
  const latest = order[order.length - 1] === pub.id;
  const groups = printRows(copy, days);
  const changed = copy.entries.filter((e) => e.changed).length;
  // A7: the week was changed after this was published: say so before anyone prints it.
  const since = latest ? await loadPublishState(supabase, pub.week_id) : null;
  const notYetPublished = since ? since.changed.size + since.removed : 0;

  return (
    <div className="rota-print-page">
      <div className="print:hidden">
        <BackLink href={`/rota?week=${monday}`}>{weekTitle(monday)}</BackLink>
        {query.new === "1" && (
          <div className="mt-3">
            <Notice tone="success" floating testId="notice">
              Published. This is the one-page rota to print or save as a PDF.
            </Notice>
          </div>
        )}
        {notYetPublished > 0 && (
          <div className="mt-3" data-testid="unpublished-changes">
            <Notice tone="warning" title="The week has changes that are not published yet.">
              {changesSentence(since!.changed.size, since!.removed)} This page prints the rota as it was published.{" "}
              <Link href={`/rota/publish?week=${monday}`} className="font-semibold">
                Publish again
              </Link>{" "}
              to print the changes.
            </Notice>
          </div>
        )}
        {!latest && (
          <div className="mt-3">
            <Notice tone="info">This is an older publication of this week. The week has been published again since.</Notice>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <PrintNowButton />
          <span className="text-sm">
            In the print window choose A4 and landscape. &ldquo;Save as PDF&rdquo; makes a file to email or put on the noticeboard.
          </span>
        </div>
      </div>

      <div className="rota-print mt-4 rounded-2xl border border-icci-line bg-white p-4 shadow-card print:mt-0 print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid="rota-print">
        <header className="mb-2 flex items-center gap-3">
          <Logo size={44} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-bold leading-tight text-icci-green-dark">ICCI rota: {weekTitle(monday).replace(/^Week of /, "week of ")}</h1>
            <p className="text-[11px] text-icci-ink-60" data-testid="print-published">
              Published {publishedAtText(pub.published_at)} by {nameOf(pub.published_by)}
              {version > 1 && ` (version ${version} of this week)`}.{" "}
              {copy.previous_publication_id
                ? changed + copy.removed.length > 0
                  ? `Changed since the version before: ${changed + copy.removed.length}, marked “Changed”.`
                  : "No changes since the version before."
                : "First publication of this week."}
            </p>
          </div>
        </header>

        <table className="rota-print-table w-full table-fixed border-collapse text-left">
          <colgroup>
            <col style={{ width: "10%" }} />
            {days.map((d) => (
              <col key={d} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Slot</th>
              {days.map((d) => (
                <th key={d} scope="col" title={fullDayLabel(d)}>
                  {shortDayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.group}>
              <tr className="rota-print-group">
                <th colSpan={8} scope="rowgroup">
                  {SLOT_GROUP_LABEL[g.group]}
                </th>
              </tr>
              {g.rows.map((row) => (
                <tr key={row.slotTypeId}>
                  <th scope="row" dir="auto">
                    {row.slot}
                  </th>
                  {row.byDay.map((list, i) => (
                    <td key={i}>
                      {list.map((e) => (
                        <Cell key={e.id} e={e} />
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>

        {copy.removed.length > 0 && (
          <div className="mt-2 text-[10px]" data-testid="print-removed">
            <span className="rota-changed-word">Changed</span> <strong>Taken off since the version before:</strong>{" "}
            {copy.removed.map((r) => removedText(r, shortDayLabel)).join("; ")}.
          </div>
        )}
        <p className="mt-2 text-[10px] text-icci-ink-60">
          &ldquo;Not filled yet&rdquo; = nobody on that slot when published. Prayer times as entered by the Centre. Questions: speak to the Centre office.
        </p>
      </div>
    </div>
  );
}

function Cell({ e }: { e: FrozenEntry }) {
  return (
    <div className={cx("rota-print-entry", e.changed && "rota-print-changed")} data-testid="print-entry" data-changed={e.changed ? "yes" : undefined}>
      {e.changed && <span className="rota-changed-word">Changed</span>}
      <span className={cx("block font-semibold", !e.person && "rota-print-empty")} dir="auto">
        {personText(e)}
      </span>
      <span className="block">
        {timeText(e.slot_group, e.starts_at, e.ends_at)}
        {e.place && ` · ${e.place}`}
      </span>
    </div>
  );
}
