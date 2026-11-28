// A service register (Phase 6): funerals, Shahada or Nikah, newest first,
// 50 to a page. Find by name or number, narrow by year, and show cancelled
// entries if wanted. Super Admin only; the database refuses everyone else.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookLock, Plus } from "lucide-react";
import { CannotSee, EmptyState, fieldClass, LinkButton, PageHeader, Pagination, Skeleton, StatusBadge } from "@/components/ui";
import { FilterFold } from "@/components/ui/filter-fold";
import { requireAdmin } from "@/lib/auth/current-admin";
import { cleanSearch, formatDate } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { pageRows } from "@/lib/supabase/page-rows";
import {
  CIVIL,
  entryName,
  isRegisterKind,
  MAY_SEE_REGISTERS,
  peopleOf,
  REGISTER,
  servicesWords,
  yearsFrom,
  type FuneralRow,
  type NikahRow,
  type RegisterKind,
  type RegisterRow,
  type ShahadaRow,
} from "@/lib/registers/rules";
import { todayInDublin } from "@/lib/vetting/rules";
import { peopleNames } from "../data";

const PAGE_SIZE = 50;
const SHOW = { current: "In use", cancelled: "Cancelled", all: "Everything" } as const;
type Show = keyof typeof SHOW;

export async function generateMetadata(props: PageProps<"/registers/[kind]">): Promise<Metadata> {
  const { kind } = await props.params;
  return { title: `${isRegisterKind(kind) ? REGISTER[kind].title : "Register"} | ICCI Control Dashboard` };
}

export default function RegisterPage(props: PageProps<"/registers/[kind]">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function detail(kind: RegisterKind, r: RegisterRow, names: Map<string, { name: string; on: boolean }>): string {
  const who = (id: string) => names.get(id)?.name ?? "Not found";
  if (kind === "funerals") return `${servicesWords(r as FuneralRow)} · on duty: ${(r as FuneralRow).on_duty_person_ids.map(who).join(", ")}`;
  if (kind === "shahada") return `Imam: ${who((r as ShahadaRow).imam_person_id)}`;
  const n = r as NikahRow;
  return `Officiant: ${who(n.officiant_person_id)} · civil marriage: ${CIVIL[n.civil_registration].toLowerCase()}`;
}

async function Content({ params, searchParams }: Pick<PageProps<"/registers/[kind]">, "params" | "searchParams">) {
  const { kind } = await params;
  if (!isRegisterKind(kind)) notFound();
  const cfg = REGISTER[kind];
  const me = await requireAdmin();
  if (!MAY_SEE_REGISTERS.includes(me.roleCode)) return <CannotSee area="registers" title={cfg.title} />;

  const sp = await searchParams;
  const q = cleanSearch(typeof sp.q === "string" ? sp.q : "");
  const today = todayInDublin();
  const years = yearsFrom(today);
  const year = typeof sp.year === "string" && years.includes(Number(sp.year)) ? Number(sp.year) : null;
  const show: Show = typeof sp.show === "string" && sp.show in SHOW ? (sp.show as Show) : "current";
  const page = typeof sp.page === "string" ? Number(sp.page) : 1;

  const supabase = await createClient();
  const shown = await pageRows<RegisterRow>(page, PAGE_SIZE, (from, to) => {
    let query = supabase.from(cfg.view).select("*", { count: "exact" });
    if (q) query = query.or(cfg.searchIn.map((c) => `${c}.ilike.*${q}*`).join(","));
    if (year) query = query.gte("service_date", `${year}-01-01`).lte("service_date", `${year}-12-31`);
    if (show === "current") query = query.is("cancelled_at", null);
    if (show === "cancelled") query = query.not("cancelled_at", "is", null);
    return query.order("service_date", { ascending: false }).order("id", { ascending: false }).range(from, to);
  });
  const rows = shown.rows;
  const names = await peopleNames(supabase, rows.flatMap((r) => peopleOf(kind, r)));
  const filtered = Boolean(q || year || show !== "current");
  const link = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (year) u.set("year", String(year));
    if (show !== "current") u.set("show", show);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return `/registers/${kind}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.intro}
        actions={
          <LinkButton href={`/registers/${kind}/new`} icon={Plus}>
            {cfg.addLabel}
          </LinkButton>
        }
      />
      <form data-folded="true" method="get" className="list-filters grid gap-3 sm:grid-cols-[2fr_1fr_1fr]" role="search" aria-label={`Find in the ${cfg.title.toLowerCase()}`}>
        <label>
          <span className="font-semibold">Name or number</span>
          <input dir="auto" name="q" defaultValue={q} className={fieldClass} />
        </label>
        <label>
          <span className="font-semibold">Year</span>
          <select name="year" defaultValue={year ?? ""} className={fieldClass}>
            <option value="">Every year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Show</span>
          <select name="show" defaultValue={show} className={fieldClass}>
            {(Object.keys(SHOW) as Show[]).map((k) => (
              <option key={k} value={k}>
                {SHOW[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900">
            Search
          </button>
          {filtered && (
            <Link href={`/registers/${kind}`} className="inline-flex min-h-11 items-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
              Clear filters
            </Link>
          )}
        </div>
        <FilterFold />
      </form>

      <p className="mt-5 text-[15px] text-icci-ink-60" data-testid="register-count">
        {shown.total === 0 ? (filtered ? "No entries match." : "") : `${shown.total} ${shown.total === 1 ? "entry" : "entries"}`}
      </p>

      {shown.total === 0 && !filtered ? (
        <EmptyState icon={BookLock} title="Nothing recorded yet">
          {cfg.addLabel} when one takes place. Each entry gets its number from the database.
        </EmptyState>
      ) : (
        <>
          <div className="list-table-wrap">
            <table className="list-table hidden md:table">
              <thead>
                <tr>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">{kind === "nikah" ? "Couple" : "Name"}</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid="register-row" className="border-b border-icci-panel align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={`/registers/${kind}/${r.first_id}`} className="code-tag font-semibold text-icci-green!">
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.service_date)}</td>
                    <td className="px-3 py-2" dir="auto">
                      <span className="font-semibold">{entryName(kind, r)}</span>{" "}
                      {r.cancelled_at && <StatusBadge word="Cancelled" tone="grey" />}
                    </td>
                    <td className="px-3 py-2 text-sm" dir="auto">
                      {detail(kind, r, names)}
                      {r.versions > 1 && <span className="block text-icci-ink-60">Corrected ({r.versions} versions)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/registers/${kind}/${r.first_id}`} data-testid="register-row" className="list-card">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-icci-green" dir="auto">
                      {entryName(kind, r)}
                    </span>
                    {r.cancelled_at && <StatusBadge word="Cancelled" tone="grey" />}
                  </span>
                  <span className="mt-1 block text-sm">
                    <span className="code-tag">{r.number}</span> · {formatDate(r.service_date)}
                  </span>
                  <span className="block text-sm" dir="auto">
                    {detail(kind, r, names)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {shown.pages > 1 && <Pagination page={shown.page} size={PAGE_SIZE} total={shown.total} hrefFor={link} />}
        </>
      )}
      <p className="mt-4 text-sm">
        Only a Super Admin can see this register. It is not on Home, in the search box or in any download. {cfg.never}
      </p>
    </>
  );
}
