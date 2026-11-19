import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { FindLabel } from "../../items/find-label";
import { SecondaryLink } from "../../items/ui";

export const metadata: Metadata = { title: "Label not recognised | ICCI Control Dashboard" };

export default function UnknownLabelPage(props: PageProps<"/labels/unknown">) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Label Not Recognised</h1>
      <Suspense fallback={null}>
        <Message searchParams={props.searchParams} />
      </Suspense>
      <p className="mt-2">Check the number on the label and try again. Only labels printed by this system can be used.</p>
      <div className="mt-4">
        <FindLabel />
      </div>
      <div className="mt-6">
        <Suspense fallback={null}>
          <BackLink />
        </Suspense>
      </div>
    </main>
  );
}

/** Back to the list this person uses: items, or the library (slice P4.2). */
async function BackLink() {
  const me = await requireAdmin();
  return me.roleCode === "library_operator" ? (
    <SecondaryLink href="/library">Back to the library</SecondaryLink>
  ) : (
    <SecondaryLink href="/items">Back to items</SecondaryLink>
  );
}

async function Message({ searchParams }: { searchParams: PageProps<"/labels/unknown">["searchParams"] }) {
  const { number, reason } = await searchParams;
  const shown = typeof number === "string" ? number.slice(0, 20) : "";
  if (reason === "item") {
    return (
      <p role="alert" className="mt-4 rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3 text-icci-error" data-testid="label-on-item">
        <span className="font-semibold">Problem: </span>
        {`"${shown}" is on one of the Centre's items, not a library book. Use a new label for the book.`}
      </p>
    );
  }
  return (
    <p role="alert" className="mt-4 rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3 text-icci-error">
      <span className="font-semibold">Problem: </span>
      {shown ? `"${shown}" is not a label number on the list of printed labels.` : "No label number was given."}
    </p>
  );
}
