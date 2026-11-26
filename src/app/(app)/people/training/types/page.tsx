// Training types (slice P2.4): the list of courses that can be recorded.
// Super Admin and Centre Admin can add one, change its name or usual length,
// and switch it off (never delete). A switched-off type keeps its old
// entries but cannot be picked for new ones. Designed for a PC first.
import { messageTone } from "@/lib/ui/messages";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_PEOPLE } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";
import { MAX_YEARS, usualLengthText, type TrainingType } from "@/lib/training/rules";
import { setTrainingTypeActive } from "../../training-actions";
import { loadTrainingTypes } from "../data";
import { AddTypeForm, EditTypeForm } from "./type-forms";
import { BackLink, buttonClass, CannotSee, PageNotice, Skeleton, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Training types | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Training type added.",
  saved: "Changes saved. Entries already recorded keep their own expiry dates.",
  "switched-off": "Switched off. Old entries stay, but it cannot be picked for new ones.",
  "switched-on": "Switched back on.",
  "not-allowed": "Your account is not allowed to do this.",
};

export default function TrainingTypesPage(props: PageProps<"/people/training/types">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <BackLink href="/people/training">Training</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Training Types</h1>
      <p className="mt-2">
        The courses that can be recorded. The usual length fills in the expiry date when training is recorded; it can
        still be changed each time. Leave it empty for training that does not expire.
      </p>
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/people/training/types">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSee area="people" />;
  const { done } = await searchParams;
  const supabase = await createClient();
  const types = await loadTrainingTypes(supabase);
  const inUse = types.filter((t) => t.active);
  const off = types.filter((t) => !t.active);

  return (
    <>
      {typeof done === "string" && DONE[done] && (
        <PageNotice floating tone={messageTone(done)} testId="notice">{DONE[done]}</PageNotice>
      )}
      <p id="years-hint" className="sr-only">
        A whole number of years from 1 to {MAX_YEARS}, or empty for no expiry.
      </p>

      <section className="mt-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold text-icci-green-dark">Add a training type</h2>
        <AddTypeForm />
      </section>

      <ul className="mt-6 space-y-3" data-testid="training-types">
        {inUse.map((t) => (
          <TypeCard key={t.id} t={t} />
        ))}
      </ul>
      {off.length > 0 && (
        <details className="mt-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">
            Switched off ({off.length})
          </summary>
          <ul className="mt-2 space-y-3" data-testid="training-types-off">
            {off.map((t) => (
              <TypeCard key={t.id} t={t} />
            ))}
          </ul>
        </details>
      )}
      <p className="mt-4 text-sm">Training types are never deleted. Switch one off when it is no longer used.</p>
    </>
  );
}

function TypeCard({ t }: { t: TrainingType }) {
  const button = "inline-flex min-h-11 items-center justify-center rounded-[10px] border px-4 py-2 font-semibold transition-colors duration-150";
  return (
    <li data-testid="training-type" className={`rounded-2xl border p-5 shadow-card ${t.active ? "border-icci-line bg-white" : "border-dashed border-icci-text/40 bg-[#F0F0EE]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block font-semibold" dir="auto">
            {t.name}
          </span>
          <span className="block text-sm">{usualLengthText(t.usual_years)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <StatusBadge {...(t.active ? { word: "In use", tone: "green" as const } : { word: "Switched off", tone: "grey" as const })} />
          <form action={setTrainingTypeActive.bind(null, t.id, !t.active)}>
            {t.active ? (
              <button type="submit" className={buttonClass("danger")}>
                Switch off
              </button>
            ) : (
              <button type="submit" className={`${button} border-icci-green-dark bg-icci-green-dark text-white shadow-sm hover:bg-icci-green-900`}>
                Switch back on
              </button>
            )}
          </form>
        </span>
      </div>
      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Change name or usual length</summary>
        <EditTypeForm type={t} />
      </details>
    </li>
  );
}
