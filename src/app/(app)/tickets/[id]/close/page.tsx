// "Close a ticket" (slice P3.6): closing note, optional cost, and "Also mark
// the asset repaired" when the ticket is about an asset marked damaged.
// Phone-first.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";
import { MAY_SEE_TICKETS, shortDescription, STATUS_LABEL, ticketNumber, type TicketStatus } from "@/lib/tickets/rules";
import { CloseTicketForm } from "../../forms";
import { BackLink, CannotSee, Skeleton, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Close a ticket | ICCI Control Dashboard" };

export default function CloseTicketPage(props: PageProps<"/tickets/[id]/close">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/tickets/[id]/close">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_TICKETS.includes(me.roleCode)) return <CannotSee area="tickets" />;
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("maintenance_tickets").select("id, description, status, item_id").eq("id", Number(id)).maybeSingle();
  if (!data) notFound();
  const t = data as { id: number; description: string; status: TicketStatus; item_id: string | null };
  const { data: item } = t.item_id
    ? await supabase.from("items").select("id, name, condition").eq("id", t.item_id).maybeSingle()
    : { data: null };
  const damaged = (item as { condition: string } | null)?.condition === "damaged";

  return (
    <>
      <BackLink href={`/tickets/${t.id}`}>Back to the ticket</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Close Ticket <span className="title-code">{ticketNumber(t.id)}</span></h1>
      <p className="mt-2 text-lg font-semibold" dir="auto">
        {shortDescription(t.description)}
      </p>
      {item && (
        <p className="text-sm">
          About {(item as { name: string }).name}
          {damaged ? ", which is marked damaged." : "."}
        </p>
      )}
      {t.status === "closed" ? (
        <p className="mt-4 rounded-xl bg-icci-green-50 px-4 py-3">
          This ticket is already <StatusBadge {...STATUS_LABEL.closed} />. Go back to the ticket to reopen it.
        </p>
      ) : (
        <CloseTicketForm ticketId={t.id} canMarkRepaired={damaged} />
      )}
    </>
  );
}
