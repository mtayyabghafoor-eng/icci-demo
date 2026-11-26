// The gatekeeper's rules, kept as plain functions so they can be tested
// without a browser or a database.

/** Sign out after 15 minutes without mouse, keyboard or touch (PLAN.md section 3). */
export const IDLE_LIMIT_MS = 15 * 60 * 1000;

/** Cookie holding the time of the admin's last activity (milliseconds). */
export const LAST_ACTIVE_COOKIE = "icci_last_active";

/**
 * Round C3: the activity cookie is marked "secure" on the real site, so it
 * only ever travels over an encrypted (https) connection. On this PC
 * (http://localhost) it cannot be, or it would not be kept.
 */
export function activityCookieOptions(https: boolean) {
  return { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24, secure: https };
}

/** Allowed clock difference between the admin's device and the server. */
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * How the visitor signed in:
 * - null: not signed in
 * - aal1: password only (still needs the authenticator code)
 * - aal2: password and authenticator code (admins)
 * - email_code: an emailed one-time code (Library Operator, slice P4.1)
 * The gatekeeper only uses this to pick the page. The database decides
 * whether that way of signing in is allowed for the person's role.
 */
export type Assurance = "aal1" | "aal2" | "email_code" | null;

/** Reads the sign-in pass (already checked by Supabase) into an Assurance. */
export function assuranceOf(claims: { aal?: unknown; amr?: unknown } | null | undefined): Assurance {
  if (!claims) return null;
  if (claims.aal === "aal2") return "aal2";
  const methods = Array.isArray(claims.amr)
    ? claims.amr.map((a) => (a && typeof a === "object" ? (a as { method?: unknown }).method : undefined))
    : [];
  if (methods.includes("otp") && !methods.includes("password")) return "email_code";
  return "aal1";
}

/**
 * While the Library Operator waits for their emailed code, their email
 * address is kept here (never in the address bar). Ten minutes, like the code.
 */
export const LIBRARY_PENDING_COOKIE = "icci_library_pending";

/**
 * Round C5: the last step of a first sign-in (a new account's temporary
 * password): with the authenticator just set up, the person chooses their
 * own password here. The database still gives them nothing until they have.
 */
export const NEW_PASSWORD_PATH = "/sign-in/new-password";

/** The two pages a signed-out visitor may open for the emailed-code sign-in. */
export const LIBRARY_SIGN_IN_PATHS = ["/sign-in/library", "/sign-in/library/code"];

/**
 * True when the admin has been idle for 15 minutes or more. A missing,
 * garbled or far-future time counts as idle, so mistakes fail safe.
 */
export function isIdleExpired(lastActive: string | undefined, now: number): boolean {
  if (!lastActive) return true;
  const t = Number(lastActive);
  if (!Number.isFinite(t)) return true;
  if (t > now + FUTURE_TOLERANCE_MS) return true;
  return now - t >= IDLE_LIMIT_MS;
}

/** How long before the idle sign-out, for the warning bar. 0 when already due. */
export function idleMsLeft(lastActive: string | undefined, now: number): number {
  if (isIdleExpired(lastActive, now)) return 0;
  return Math.max(0, IDLE_LIMIT_MS - (now - Number(lastActive)));
}

/** The warning bar appears in the last two minutes. */
export const IDLE_WARNING_MS = 2 * 60 * 1000;

function isSignInArea(pathname: string): boolean {
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

/**
 * Where to go after signing in. Only a page inside this app is accepted, so a
 * tampered link can never send an admin to another website.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  // Browsers silently drop tabs and line breaks inside an address, and read
  // "\" as "/", so "/<tab>/evil.example" would lead to another website.
  // Refuse any hidden character, space or backslash outright.
  if (/[\u0000- \u007F\\]/.test(raw)) return "/";
  // And check the way a browser would: it must stay on this site.
  const base = "http://icci.invalid";
  let parsed: URL;
  try {
    parsed = new URL(raw, base);
  } catch {
    return "/";
  }
  if (parsed.origin !== base) return "/";
  const pathname = raw.split(/[?#]/)[0];
  if (isSignInArea(pathname)) return "/";
  return raw;
}

export type RouteInput = {
  pathname: string;
  search: string;
  /** How the visitor signed in (see Assurance). */
  aal: Assurance;
  lastActive: string | undefined;
  now: number;
};

export type RouteDecision = { kind: "allow" } | { kind: "redirect"; to: string; signOut: boolean };

const redirect = (to: string, signOut = false): RouteDecision => ({ kind: "redirect", to, signOut });

/**
 * The daily reminder timer's address (slice P2.9). The timer cannot sign
 * in, so this one address is let through; it does nothing without the
 * timer's secret key, which the address and the database both check.
 */
export const REMINDER_TIMER_PATH = "/api/reminders/daily";

export function decideRoute({ pathname, search, aal, lastActive, now }: RouteInput): RouteDecision {
  const here = pathname + search;

  // The sign-out page only ever ends a sign-in, so it is open to everyone.
  if (pathname === "/sign-out") return { kind: "allow" };

  // The reminder timer: exactly this address, nothing under it.
  if (pathname === REMINDER_TIMER_PATH) return { kind: "allow" };

  if (aal !== null && isIdleExpired(lastActive, now)) {
    return redirect("/sign-in?reason=idle", true);
  }

  if (aal === null) {
    if (pathname === "/sign-in" || LIBRARY_SIGN_IN_PATHS.includes(pathname)) return { kind: "allow" };
    if (isSignInArea(pathname)) return redirect("/sign-in");
    return redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  }

  if (aal === "aal1") {
    if (isSignInArea(pathname)) return { kind: "allow" };
    return redirect(`/sign-in/code?next=${encodeURIComponent(here)}`);
  }

  // Fully signed in: password and authenticator, or an emailed code.
  if (aal === "aal2" && pathname === NEW_PASSWORD_PATH) return { kind: "allow" };
  if (isSignInArea(pathname)) {
    return redirect(safeNextPath(new URLSearchParams(search).get("next")));
  }
  return { kind: "allow" };
}
