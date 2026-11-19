// Corrections waiting for approval. A different admin approves or rejects;
// your own corrections are shown, without the buttons (the database refuses
// them anyway).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDateTime } from "@/lib/items/rules";
import { ADJUSTMENT_STATUS, MOVEMENT_LABEL } from "@/lib/stock/rules";
import { createClient } from "@/lib/supabase/server";
import { loadLookups } from "../../items/data";
import { Notice, StatusBadge } from "../../items/ui";
import { adminNames, MOVEMENT_COLUMNS, type Movement } from "../data";
import { DecideForm } from "../forms";

export const metadata: Metadata = { title: "Waiting for approval | ICCI Control Dashboard" };

export default function ApprovalsPage(props: PageProps<"/stock/approvals">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <p className="text-sm">
        <Link className="back-link" href="/stock">← Low stock</Link>
      </p>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Waiting for Approval</h1>
      <p className="mt-2">
        Corrections of stock entries. Each one counts only after a <strong>different admin</strong> approves it. The
        original entry always stays in the history.
      </p>
      <Suspense fallback={<p className="mt-4">Loading corrections…</p>}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/stock/approvals">["searchParams"] }) {
  const { done } = await searchParams;
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_movements")
    .select(MOVEMENT_COLUMNS)
    .eq("status", "pending")
    .order("id");
  const pending = (data ?? []) as Movement[];

  const originalIds = pending.map((p) => p.corrects_id!).filter(Boolean);
  const itemIds = [...new Set(pending.map((p) => p.item_id))];
  const [originals, items, nameOf, lookups] = await Promise.all([
    originalIds.length ? supabase.from("stock_movements").select(MOVEMENT_COLUMNS).in("id", originalIds) : { data: [] },
    itemIds.length ? supabase.from("items").select("id, name, label_serial, unit, location_id").in("id", itemIds) : { data: [] },
    adminNames(supabase),
    loadLookups(supabase),
  ]);
  const originalOf = new Map(((originals.data ?? []) as Movement[]).map((m) => [m.id, m]));
  const itemOf = new Map(
    ((items.data ?? []) as { id: string; name: string; label_serial: string; unit: string; location_id: string }[]).map((i) => [i.id, i]),
  );
  const waiting = ADJUSTMENT_STATUS.pending;

  return (
    <>
      {done === "approved" && <Notice>Correction approved. The stock now uses the corrected number.</Notice>}
      {done === "rejected" && <Notice>Correction rejected. The original number still stands.</Notice>}
      <p className="mt-4" data-testid="pending-count">
        {pending.length === 0 ? "Nothing is waiting for approval." : `${pending.length} waiting.`}
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((p) => {
          const original = originalOf.get(p.corrects_id!);
          const item = itemOf.get(p.item_id);
          const mine = p.created_by === me.id;
          return (
            <li key={p.id} className="list-card" data-testid="pending-correction">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p>
                  <Link href={`/items/${p.item_id}`} className="font-semibold">
                    {item?.name}
                  </Link>
                  <span className="block text-sm">
                    {item?.label_serial} · {item ? lookups.locationName.get(item.location_id) : ""}
                  </span>
                </p>
                <StatusBadge word={waiting.word} tone={waiting.tone} />
              </div>
              <p className="mt-2 text-lg">
                {original ? MOVEMENT_LABEL[original.kind] : "Entry"} of{" "}
                <span className="line-through">{original?.quantity}</span> → <strong>{p.quantity}</strong> {item?.unit}
              </p>
              {original && (
                <p className="text-sm">
                  Original entry: {formatDateTime(original.created_at)} · {nameOf(original.created_by)}
                </p>
              )}
              <p className="mt-2">
                <span className="font-semibold">Reason:</span> {p.reason}
              </p>
              <p className="text-sm">
                Asked for by {nameOf(p.created_by)} · {formatDateTime(p.created_at)}
              </p>
              {mine ? (
                <p className="mt-3 rounded-xl bg-icci-green-50 px-4 py-3">You entered this correction, so a different admin must decide on it.</p>
              ) : (
                <DecideForm adjustmentId={p.id} />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
