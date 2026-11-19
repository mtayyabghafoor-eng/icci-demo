// "Lost and withdrawn" as a CSV file. Only a Super Admin or Centre Admin
// gets a file (the gatekeeper in src/proxy.ts has already sent signed-out
// visitors to the sign-in page).
import { libraryFileName, lostCsv, mayDownloadLibraryCsv } from "@/lib/library/lists";
import { createClient } from "@/lib/supabase/server";
import { loadCopyList } from "../../data";

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims.sub;
  if (!id) return new Response("Please sign in.", { status: 401 });

  // The Library Operator signs in with an emailed code (no authenticator), so the role is
  // checked first and gets a clear "no"; an admin must have entered the authenticator code.
  const { data: me } = await supabase.from("app_users").select("role").eq("id", id).maybeSingle();
  if (!me || !mayDownloadLibraryCsv(me.role)) {
    return new Response("Your account cannot download library lists. Only a Super Admin or Centre Admin can.", { status: 403 });
  }
  if (claims.claims.aal !== "aal2") return new Response("Please sign in.", { status: 401 });

  const rows = await loadCopyList(supabase, ["lost", "withdrawn"], [
    { column: "status", ascending: true },
    { column: "flagged_on", ascending: false },
    { column: "title", ascending: true },
  ]);
  return new Response(lostCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${libraryFileName("lost-and-withdrawn", new Date())}"`,
      "Cache-Control": "no-store",
    },
  });
}
