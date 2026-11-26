// One month's file for the bookkeeper as a CSV (slice P5.5). The gatekeeper
// (src/proxy.ts) sends signed-out visitors to sign in first; here only a
// Super Admin, Centre Admin or Finance gets a file.
import { monthFileName, monthCsv } from "@/lib/expenses/export";
import { monthRange } from "@/lib/expenses/claims";
import { MAY_HANDLE_EXPENSES } from "@/lib/expenses/rules";
import { createClient } from "@/lib/supabase/server";
import { loadMonthExport } from "../data";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims.sub;
  if (!id || claims.claims.aal !== "aal2") return new Response("Please sign in.", { status: 401 });
  const { data: me } = await supabase.from("app_users").select("role").eq("id", id).maybeSingle();
  if (!me || !MAY_HANDLE_EXPENSES.includes(me.role)) {
    return new Response("Your account cannot see expenses. Only a Super Admin, Centre Admin or Finance can.", { status: 403 });
  }
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!monthRange(month)) return new Response("Choose a month, for example 2026-11.", { status: 400 });
  const { data } = await loadMonthExport(supabase, month);
  return new Response(monthCsv(data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${monthFileName(month)}"`,
      "Cache-Control": "no-store",
    },
  });
}
