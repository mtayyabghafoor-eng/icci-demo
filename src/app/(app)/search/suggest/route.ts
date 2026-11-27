// D8: the short list under the search box as you type. Asked as the
// signed-in admin, so the database decides what each person may see.
// Nothing is kept by the browser.
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/current-admin";
import { assuranceOf } from "@/lib/auth/rules";
import { searchEverything } from "@/lib/search/everything";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  // The Library Operator signs in with an emailed code; everyone else needs the authenticator.
  const level = assuranceOf(claims?.claims);
  if (!claims?.claims.sub || (level !== "aal2" && level !== "email_code")) return new Response("Please sign in.", { status: 401 });
  const admin = await requireAdmin();
  const raw = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const answer = await searchEverything(supabase, raw, admin.roleCode, 4);
  return NextResponse.json(answer, { headers: { "Cache-Control": "private, no-store" } });
}
