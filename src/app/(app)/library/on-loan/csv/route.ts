// The "On loan" list as a CSV file. The gatekeeper (src/proxy.ts) sends signed-out
// visitors to the sign-in page first; here only a Super Admin or Centre Admin
// gets a file (the Library Operator does not).
import { libraryFileName, mayDownloadLibraryCsv, onLoanCsv, type CsvCopyRow } from "@/lib/library/lists";
import { createClient } from "@/lib/supabase/server";
import { loadBorrowers, loadCopyList } from "../../data";

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

  const rows = await loadCopyList(supabase, ["on_loan", "overdue"], [{ column: "due_on", ascending: true }, { column: "title", ascending: true }]);
  const borrowers = await loadBorrowers(supabase, rows.flatMap((r) => (r.borrower_id ? [r.borrower_id] : [])));
  const csvRows: CsvCopyRow[] = rows.map((r) => ({ ...r, borrower: (r.borrower_id && borrowers.get(r.borrower_id)) || null }));
  return new Response(onLoanCsv(csvRows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${libraryFileName("on-loan", new Date())}"`,
      "Cache-Control": "no-store",
    },
  });
}
