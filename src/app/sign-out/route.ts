// Ends the sign-in and shows the sign-in page with the reason. Used:
// - by the idle timer after 15 minutes without activity (reason=idle)
// - when someone signed in has no access, e.g. their account was switched
//   off while they were using the app (reason=no-access)
// The "Sign out" button uses a form action instead.
//
// Round C3: any web page could open this address (a hidden picture link,
// for example) and sign an admin out. So it signs out only when it is
// really due: idle for 15 minutes by the activity time, or an account the
// database no longer shows. Otherwise it goes back to Home and nothing ends.
import { NextResponse, type NextRequest } from "next/server";
import { isIdleExpired, LAST_ACTIVE_COOKIE } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";

/** The idle timer runs on the admin's device; allow its clock to be a minute ahead. */
const CLOCK_MARGIN_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason") === "no-access" ? "no-access" : "idle";
  const supabase = await createClient();

  let due: boolean;
  if (reason === "idle") {
    due = isIdleExpired(request.cookies.get(LAST_ACTIVE_COOKIE)?.value, Date.now() + CLOCK_MARGIN_MS);
  } else {
    const { data: claims } = await supabase.auth.getClaims();
    const id = claims?.claims.sub;
    if (!id) {
      due = true;
    } else {
      // Only a clear answer of "no such account here" ends the sign-in.
      const { data, error } = await supabase.from("app_users").select("id").eq("id", id).maybeSingle();
      due = !error && !data;
    }
  }
  if (!due) return NextResponse.redirect(new URL("/", request.url));

  await supabase.auth.signOut({ scope: "local" });
  const response = NextResponse.redirect(new URL(`/sign-in?reason=${reason}`, request.url));
  response.cookies.delete(LAST_ACTIVE_COOKIE);
  return response;
}
