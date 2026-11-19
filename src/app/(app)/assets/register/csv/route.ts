// The asset register as a CSV file (all of it, or one place and what is
// inside it). The gatekeeper (src/proxy.ts) sends signed-out visitors to the
// sign-in page first; here only a Super Admin or Centre Admin gets a file.
import { MAY_SEE_ASSET_LISTS, registerCsv, registerFileName } from "@/lib/assets/lists";
import { createClient } from "@/lib/supabase/server";
import { loadRegister } from "../data";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims.sub;
  if (!id || claims.claims.aal !== "aal2") return new Response("Please sign in.", { status: 401 });

  const { data: me } = await supabase.from("app_users").select("role").eq("id", id).maybeSingle();
  if (!me || !MAY_SEE_ASSET_LISTS.includes(me.role)) {
    return new Response("Your account cannot see assets. Only a Super Admin or Centre Admin can.", { status: 403 });
  }

  const place = new URL(request.url).searchParams.get("place") ?? "";
  const { rows } = await loadRegister(supabase, place);
  rows.sort((a, b) => a.place.localeCompare(b.place) || (b.value_cents ?? -1) - (a.value_cents ?? -1));

  return new Response(registerCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${registerFileName(new Date())}"`,
      // Never kept by the browser or anything in between.
      "Cache-Control": "no-store",
    },
  });
}
