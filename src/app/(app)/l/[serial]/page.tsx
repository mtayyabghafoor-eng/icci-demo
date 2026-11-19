// A scanned QR label: /l/ICCI-000123. (Signed-out visitors never reach this:
// the gatekeeper in src/proxy.ts sends them to the sign-in page first.)
//   - "scanning for" a stocktake in this browser (slice 8) → that stocktake's
//                              scan screen, if the stocktake is still open
//   - label on a library copy → open the copy (slice P4.2)
//   - label on an item       → open the item
//   - printed, not yet used  → "Register an item" with the number filled in
//                              (admins; the page also offers "Add a book"),
//                              or "Add a book" for the Library Operator
//   - anything else          → "label not recognised"
// A page (not a plain link handler) so the address bar always ends up on the
// page that is shown.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { parseLabelNumber, safeDecode } from "@/lib/items/rules";
import { parseStocktakeId, SCANNING_COOKIE } from "@/lib/stocktake/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";

export default function ScanPage(props: PageProps<"/l/[serial]">) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <Suspense fallback={<p>Opening label…</p>}>
        <Forward params={props.params} />
      </Suspense>
    </main>
  );
}

async function Forward({ params }: { params: PageProps<"/l/[serial]">["params"] }) {
  const { serial: raw } = await params;
  const text = safeDecode(raw);
  const serial = parseLabelNumber(text);
  if (!serial) redirect(`/labels/unknown?number=${encodeURIComponent(text.slice(0, 20))}`);

  const supabase = await createClient();
  const scanningFor = parseStocktakeId((await cookies()).get(SCANNING_COOKIE)?.value);
  if (scanningFor) {
    const { data: st } = await supabase.from("stocktakes").select("id, status").eq("id", scanningFor).maybeSingle();
    if (st?.status === "open") redirect(`/stocktake/${st.id}/scan?label=${serial}`);
  }
  // What is this label for? (Admins and the Library Operator may ask;
  // the Library Operator learns only "item", never which item.)
  const { data: use } = await supabase.rpc("label_use", { p_serial: serial });
  const found = use as { use: string; copy_id: string | null } | null;
  if (found?.use === "book_copy" && found.copy_id) redirect(`/library/copies/${found.copy_id}`);
  if (found?.use === "free") {
    const me = await requireAdmin();
    redirect(me.roleCode === "library_operator" ? `/library/new?label=${serial}` : `/items/new?label=${serial}`);
  }
  if (found?.use === "item") {
    const me = await requireAdmin();
    if (me.roleCode === "library_operator") redirect(`/labels/unknown?number=${serial}&reason=item`);
  }
  const { data: item } = await supabase.from("items").select("id").eq("label_serial", serial).maybeSingle();
  if (item) redirect(`/items/${item.id}`);
  const { data: label } = await supabase.from("labels").select("serial").eq("serial", serial).maybeSingle();
  if (label) redirect(`/items/new?label=${serial}`);
  return redirect(`/labels/unknown?number=${serial}`);
}
