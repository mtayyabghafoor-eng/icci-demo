// The tickets list as a CSV file, with the same filters as the screen. The
// gatekeeper (src/proxy.ts) sends signed-out visitors to the sign-in page
// first; here only a Super Admin or Centre Admin gets a file.
import { createClient } from "@/lib/supabase/server";
import { MAY_SEE_TICKETS, readFilters, ticketsCsv, ticketsFileName } from "@/lib/tickets/rules";
import { loadTickets } from "../data";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims.sub;
  if (!id || claims.claims.aal !== "aal2") return new Response("Please sign in.", { status: 401 });

  const { data: me } = await supabase.from("app_users").select("role").eq("id", id).maybeSingle();
  if (!me || !MAY_SEE_TICKETS.includes(me.role)) {
    return new Response("Your account cannot see maintenance tickets. Only a Super Admin or Centre Admin can.", { status: 403 });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { rows } = await loadTickets(supabase, readFilters(params));
  return new Response(ticketsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ticketsFileName(new Date())}"`,
      // Never kept by the browser or anything in between.
      "Cache-Control": "no-store",
    },
  });
}
