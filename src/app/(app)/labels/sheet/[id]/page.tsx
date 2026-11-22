// One label sheet, ready to print. On screen: a preview with a Print button
// and a "skip the first spaces" box. On paper: only the labels, placed for
// A4 sheets of 21 (Avery L7160 size).
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { currentOrigin } from "@/lib/labels/origin";
import {
  labelLink,
  labelsAreTest,
  labelTag,
  layoutSheets,
  MAX_SKIP,
  parseSkip,
  qrMatrix,
  qrSvgPath,
  serialOf,
  serialsInRange,
  SHEET_MM,
} from "@/lib/labels/sheet";
import { createClient } from "@/lib/supabase/server";
import { fieldClass, Notice } from "../../../items/ui";
import { PrintNowButton } from "../../forms";
import { BackLink } from "@/components/ui";
import { DomeEmblem } from "../../dome-emblem";

export const metadata: Metadata = { title: "Label sheet | ICCI Control Dashboard" };

const QR_MARGIN = 2; // light squares around the code, so the camera can find it

export default function LabelSheetPage(props: PageProps<"/labels/sheet/[id]">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 print:m-0 print:max-w-none print:p-0">
      <Suspense fallback={<p>Loading the sheet…</p>}>
        <Sheet params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Sheet({
  params,
  searchParams,
}: {
  params: PageProps<"/labels/sheet/[id]">["params"];
  searchParams: PageProps<"/labels/sheet/[id]">["searchParams"];
}) {
  await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const skip = parseSkip(query.skip);
  const runId = /^\d{1,12}$/.test(id) ? Number(id) : null;
  const supabase = await createClient();
  const { data: run } = runId
    ? await supabase.from("label_print_runs").select("id, first_number, last_number, label_count, reprint_of").eq("id", runId).maybeSingle()
    : { data: null };

  if (!run) {
    return (
      <>
        <BackToLabels />
        <h1 className="page-title text-[28px] md:text-[34px] mt-2">Label Sheet</h1>
        <p className="mt-4">This label sheet could not be found, or your account cannot print labels.</p>
      </>
    );
  }

  const origin = await currentOrigin();
  const test = labelsAreTest(process.env.ICCI_ENVIRONMENT);
  const tag = labelTag(process.env.ICCI_ENVIRONMENT);
  const sheets = layoutSheets(serialsInRange(run.first_number, run.last_number), skip);
  const range = run.label_count > 1 ? `${serialOf(run.first_number)} to ${serialOf(run.last_number)}` : serialOf(run.first_number);

  return (
    <>
      <div className="print:hidden">
        <BackToLabels />
        <h1 className="page-title text-[28px] md:text-[34px] mt-2">Label Sheet</h1>
        {query.new === "1" && <Notice>{run.label_count} new label numbers created.</Notice>}
        <p className="mt-3 text-lg font-semibold" data-testid="sheet-range">
          {range}
        </p>
        <p>
          {run.label_count} {run.label_count === 1 ? "label" : "labels"} on {sheets.length}{" "}
          {sheets.length === 1 ? "A4 sheet" : "A4 sheets"}
          {run.reprint_of && <> · reprint of sheet {run.reprint_of}</>}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-4 rounded-2xl border border-icci-line bg-white shadow-card p-5">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="font-semibold">Skip the first spaces</span>
              <span className="block text-sm">For a part-used sheet (0 to {MAX_SKIP})</span>
              <input
                name="skip"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_SKIP}
                defaultValue={skip}
                className={`${fieldClass} w-28`}
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 py-2 font-semibold text-icci-green! no-underline transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50"
            >
              Update preview
            </button>
          </form>
          <PrintNowButton />
        </div>
        <p className="mt-3 rounded-xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3 text-[var(--icci-warn-text)]">
          <strong>Before printing:</strong> in the print window choose <strong>A4</strong>, scale{" "}
          <strong>Actual size / 100%</strong> and <strong>no margins</strong>, and turn off headers and footers. Check
          the first sheet on plain paper held against a label sheet.
        </p>
        {test && tag && (
          <p className="mt-3 text-sm">
            These are <strong>test labels</strong>: the app has only its temporary web address. Real labels are printed
            once ICCI has a permanent address.
          </p>
        )}
        <h2 className="mt-6 mb-2 text-xl font-semibold text-icci-green-dark">Preview</h2>
      </div>

      <div className="overflow-x-auto print:overflow-visible" data-testid="label-sheets">
        {sheets.map((cells, s) => (
          <section
            key={s}
            aria-label={`Sheet ${s + 1} of ${sheets.length}`}
            className="label-sheet"
            style={{
              width: `${SHEET_MM.pageWidth}mm`,
              height: `${SHEET_MM.pageHeight}mm`,
              padding: `${SHEET_MM.top}mm ${SHEET_MM.side}mm`,
              gridTemplateColumns: `repeat(${SHEET_MM.columns}, ${SHEET_MM.labelWidth}mm)`,
              gridAutoRows: `${SHEET_MM.labelHeight}mm`,
              columnGap: `${SHEET_MM.columnGap}mm`,
            }}
          >
            {cells.map((serial, i) =>
              serial ? <Label key={i} serial={serial} link={labelLink(origin, serial)} tag={tag} /> : <div key={i} className="label-cell" />,
            )}
          </section>
        ))}
      </div>
    </>
  );
}

function Label({ serial, link, tag }: { serial: string; link: string; tag: "TEST LABEL" | null }) {
  const matrix = qrMatrix(link);
  const size = matrix.length + QR_MARGIN * 2;
  return (
    <div className="label-cell label-filled" data-testid="label" data-serial={serial} data-link={link}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="label-qr"
        role="img"
        aria-label={`QR code for ${serial}`}
        shapeRendering="crispEdges"
      >
        <rect width={size} height={size} fill="#fff" />
        <path d={qrSvgPath(matrix, QR_MARGIN)} fill="#000" />
      </svg>
      {/* A property tag (slice P1.15): the number large, whose it is, and not to remove it. */}
      <div className="label-text">
        <span className="label-owner">Property of ICCI</span>
        <span className="label-serial" aria-label={serial}>
          <span className="label-prefix">{serial.slice(0, 5)}</span>
          <span className="label-digits" data-testid="label-digits">
            {serial.slice(5)}
          </span>
        </span>
        <span className="label-keep">Do not remove</span>
        <span className="label-centre">Islamic Cultural Centre of Ireland</span>
        {tag && <span className="label-test">{tag}</span>}
      </div>
      {/* UI-9: a small black dome emblem in the top-right corner. */}
      <DomeEmblem className="label-emblem" />
    </div>
  );
}

function BackToLabels() {
  return <BackLink href="/labels">Print labels</BackLink>;
}
