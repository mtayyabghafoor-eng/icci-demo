// A scanned place label: /p/PL-0001 (slice P1.12). Opens that place's page.
// Signed-out visitors never reach this: the gatekeeper (src/proxy.ts) shows
// them the sign-in page first. Accounts that cannot see places (Finance, the
// Library Operator) learn nothing: they get "label not recognised".
// A page (not a plain link handler) so the address bar ends on the page shown.
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safeDecode } from "@/lib/items/rules";
import { parsePlaceCode } from "@/lib/places/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui";

export default function PlaceLabelPage(props: PageProps<"/p/[code]">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Forward params={props.params} />
      </Suspense>
    </main>
  );
}

async function Forward({ params }: { params: PageProps<"/p/[code]">["params"] }) {
  await requireAdmin();
  const text = safeDecode((await params).code);
  const n = parsePlaceCode(text);
  if (n) {
    const supabase = await createClient();
    const { data } = await supabase.from("locations").select("id").eq("code", n).maybeSingle();
    if (data) redirect(`/places/${data.id}`);
  }
  return redirect(`/labels/unknown?number=${encodeURIComponent(text.slice(0, 20))}`);
}
