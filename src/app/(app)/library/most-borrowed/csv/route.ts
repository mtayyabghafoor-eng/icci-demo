// "Most borrowed" as a CSV file, for the same period as the screen. Only a
// Super Admin or Centre Admin gets a file (the gatekeeper in src/proxy.ts
// has already sent signed-out visitors to the sign-in page).
import { libraryFileName, mayDownloadLibraryCsv, mostBorrowedCsv, readPeriod, type MostBorrowedRow } from "@/lib/library/lists";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";

export async function GET(request: Request) {
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

  const period = readPeriod(Object.fromEntries(new URL(request.url).searchParams), todayInDublin());
  const { data } = await supabase.rpc("library_most_borrowed", { p_since: period.since, p_until: period.until });
  const rows = ((data ?? []) as MostBorrowedRow[]).map((r) => ({ ...r, loans: Number(r.loans) }));
  return new Response(mostBorrowedCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${libraryFileName("most-borrowed", new Date())}"`,
      "Cache-Control": "no-store",
    },
  });
}
