// Place labels (slice P1.12): this place and every switched-on place inside
// it, ready to print. Shelf-edge style, A4 sheets of 14, 99.1 x 38.1 mm
// (Avery L7163 size, owner's decision 19 Nov 2026). On screen: a preview with
// a Print button and a "skip the first spaces" box; on paper: only the labels.
// Each QR code holds only the link /p/PL-0001: no other data.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fieldClass, PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { labelOrigin } from "@/lib/labels/origin";
import { labelsAreTest, labelTag, qrMatrix, qrSvgPath } from "@/lib/labels/sheet";
import {
  KIND_WORD,
  layoutPlaceSheets,
  MAX_PLACE_SKIP,
  parsePlaceSkip,
  PLACE_SHEET_MM,
  placeCode,
  placeLink,
} from "@/lib/places/rules";
import { createClient } from "@/lib/supabase/server";
import { PrintNowButton } from "../../../labels/forms";
import { allPlaces, lineOf, placeAndInside, UUID, type Place } from "../../data";
import { MAY_SEE_PLACES } from "../../page";

export const metadata: Metadata = { title: "Place labels | ICCI Control Dashboard" };

const QR_MARGIN = 2;

export default function PlaceLabelsPage(props: PageProps<"/places/[id]/labels">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 print:m-0 print:max-w-none print:p-0">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type Cell = { place: Place; where: string };

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/places/[id]/labels">["params"];
  searchParams: PageProps<"/places/[id]/labels">["searchParams"];
}) {
  const me = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!MAY_SEE_PLACES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const all = await allPlaces(await createClient());
  const byId = new Map(all.map((p) => [p.id, p]));
  const top = byId.get(id);
  if (!top) notFound();

  const onlyThis = query.only === "1";
  const skip = parsePlaceSkip(query.skip);
  const places = onlyThis ? [top] : placeAndInside(id, all);
  const cells: Cell[] = places.map((p) => ({
    place: p,
    // Where it is, without its own name: "Test Building A › Test Room A1".
    where: lineOf(p.id, byId).slice(0, -1).map((x) => x.name).join(" › "),
  }));
  const sheets = layoutPlaceSheets(cells, skip);
  const origin = labelOrigin();
  const test = labelsAreTest(process.env.ICCI_ENVIRONMENT);
  const tag = labelTag(process.env.ICCI_ENVIRONMENT);
  const line = lineOf(id, byId);
  const hasInside = placeAndInside(id, all).length > 1;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          crumbs={[{ href: "/places", label: "Places" }, ...line.map((p) => ({ href: `/places/${p.id}`, label: p.name }))]}
          title="Place Labels"
          subtitle={
            <span data-testid="place-label-count">
              {places.length} {places.length === 1 ? "label" : "labels"} on {sheets.length} {sheets.length === 1 ? "A4 sheet" : "A4 sheets"} of 14
              (99.1 × 38.1 mm, Avery L7163 size)
            </span>
          }
        />
        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
          <form method="get" className="flex flex-wrap items-end gap-3">
            {hasInside && (
              <label className="block">
                <span className="font-semibold">Which labels</span>
                <select name="only" defaultValue={onlyThis ? "1" : ""} className={`${fieldClass} w-64`}>
                  <option value="">This place and everything inside it</option>
                  <option value="1">Only this {KIND_WORD[top.kind].toLowerCase()}</option>
                </select>
              </label>
            )}
            <label className="block">
              <span className="font-semibold">Skip the first spaces</span>
              <span className="block text-sm">For a part-used sheet (0 to {MAX_PLACE_SKIP})</span>
              <input name="skip" type="number" inputMode="numeric" min={0} max={MAX_PLACE_SKIP} defaultValue={skip} className={`${fieldClass} w-28`} />
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
          <strong>Before printing:</strong> in the print window choose <strong>A4</strong>, scale <strong>Actual size / 100%</strong> and{" "}
          <strong>no margins</strong>, and turn off headers and footers. These labels need the wider sheets of 14, not the item sheets of 21.
        </p>
        {test && tag && (
          <p className="mt-3 text-sm">
            These are <strong>test labels</strong>: the app has only its temporary web address. Real labels are printed once ICCI has a permanent
            address.
          </p>
        )}
        <h2 className="mt-6 mb-2 text-xl font-semibold text-icci-green-dark">Preview</h2>
      </div>

      <div className="overflow-x-auto print:overflow-visible" data-testid="place-label-sheets">
        {sheets.map((sheet, s) => (
          <section
            key={s}
            aria-label={`Sheet ${s + 1} of ${sheets.length}`}
            className="label-sheet"
            style={{
              width: `${PLACE_SHEET_MM.pageWidth}mm`,
              height: `${PLACE_SHEET_MM.pageHeight}mm`,
              padding: `${PLACE_SHEET_MM.top}mm ${PLACE_SHEET_MM.side}mm`,
              gridTemplateColumns: `repeat(${PLACE_SHEET_MM.columns}, ${PLACE_SHEET_MM.labelWidth}mm)`,
              gridAutoRows: `${PLACE_SHEET_MM.labelHeight}mm`,
              columnGap: `${PLACE_SHEET_MM.columnGap}mm`,
            }}
          >
            {sheet.map((cell, i) =>
              cell ? <PlaceLabel key={i} cell={cell} link={placeLink(origin, cell.place.code)} tag={tag} /> : <div key={i} className="label-cell" />,
            )}
          </section>
        ))}
      </div>
    </>
  );
}

/** Large type for a short name, smaller for a long one, so it always fits. */
function nameSize(name: string): string {
  if (name.length <= 10) return "7mm";
  if (name.length <= 18) return "5.4mm";
  if (name.length <= 30) return "4.2mm";
  return "3.4mm";
}

function PlaceLabel({ cell, link, tag }: { cell: Cell; link: string; tag: "TEST LABEL" | null }) {
  const matrix = qrMatrix(link);
  const size = matrix.length + QR_MARGIN * 2;
  const code = placeCode(cell.place.code);
  return (
    <div className="label-cell place-label" data-testid="place-label" data-code={code} data-link={link}>
      <svg viewBox={`0 0 ${size} ${size}`} className="place-label-qr" role="img" aria-label={`QR code for ${code}`} shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#fff" />
        <path d={qrSvgPath(matrix, QR_MARGIN)} fill="#000" />
      </svg>
      <div className="place-label-text">
        <div className="place-label-top">
          <span className="place-label-kind">{KIND_WORD[cell.place.kind]}</span>
          {tag && <span className="label-test">{tag}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element -- printed at a fixed size; the whole round logo, never cropped */}
          <img src="/brand/icci-logo-160.png" alt="" className="place-label-logo" />
        </div>
        <span dir="auto" className="place-label-name" style={{ fontSize: nameSize(cell.place.name) }}>
          {cell.place.name}
        </span>
        {cell.where && <span className="place-label-where">{cell.where}</span>}
        <span className="place-label-code">{code}</span>
      </div>
    </div>
  );
}
