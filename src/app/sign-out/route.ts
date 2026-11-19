// Ends the sign-in and shows the sign-in page with the reason. Used:
// - by the idle timer after 15 minutes without activity (reason=idle)
// - when someone signed in has no access, e.g. their account was switched
//   off while they were using the app (reason=no-access)
// The "Sign out" button uses a form action instead.
import { NextResponse, type NextRequest } from "next/server";
import { LAST_ACTIVE_COOKIE } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason") === "no-access" ? "no-access" : "idle";
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const response = NextResponse.redirect(new URL(`/sign-in?reason=${reason}`, request.url));
  response.cookies.delete(LAST_ACTIVE_COOKIE);
  return response;
}
