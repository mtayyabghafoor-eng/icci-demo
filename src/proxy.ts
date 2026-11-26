// The gatekeeper: runs before every page.
// - Not signed in: only the sign-in page (so a scanned QR label shows only that).
// - Password only: only the authenticator-code pages.
// - Emailed code (Library Operator): let through; the database decides.
// - 15 minutes idle: signed out, even if the page is reopened later.
// The database enforces the same rules again (migration 0005), so this is
// the front door, not the only lock.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { activityCookieOptions, assuranceOf, decideRoute, LAST_ACTIVE_COOKIE, type Assurance } from "@/lib/auth/rules";


export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Checks the sign-in is genuine (signature and expiry), and refreshes it.
  const { data } = await supabase.auth.getClaims();
  const aal: Assurance = assuranceOf(data?.claims);
  const now = Date.now();

  const decision = decideRoute({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    aal,
    lastActive: request.cookies.get(LAST_ACTIVE_COOKIE)?.value,
    now,
  });

  if (decision.kind === "redirect") {
    if (decision.signOut) await supabase.auth.signOut({ scope: "local" });
    const redirect = NextResponse.redirect(new URL(decision.to, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    if (decision.signOut) redirect.cookies.delete(LAST_ACTIVE_COOKIE);
    return redirect;
  }

  // Opening a page counts as activity (background prefetches do not).
  const isPrefetch = request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
  if (aal !== null && !isPrefetch) {
    response.cookies.set(LAST_ACTIVE_COOKIE, String(now), activityCookieOptions(request.nextUrl.protocol === "https:"));
  }
  return response;
}

export const config = {
  // Everything except the site's own files: scripts and styles, the
  // browser icon and the brand pictures in public/. Round C3: before, any
  // address ending like a picture name (".png") skipped the sign-in and
  // idle checks; now only these exact folders and files do.
  matcher: ["/((?!_next/static/|_next/image|favicon\\.ico$|brand/|icci-logo\\.jpg$).*)"],
};
