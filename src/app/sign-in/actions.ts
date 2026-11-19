"use server";
// What happens when each sign-in form is sent. Runs on the web server only.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LAST_ACTIVE_COOKIE, LIBRARY_PENDING_COOKIE, safeNextPath } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null };

const ACTIVITY_COOKIE_OPTIONS = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 };

async function markActive() {
  (await cookies()).set(LAST_ACTIVE_COOKIE, String(Date.now()), ACTIVITY_COOKIE_OPTIONS);
}

function withNext(path: string, next: string) {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
}

function cleanCode(value: FormDataEntryValue | null): string {
  return String(value ?? "").replace(/\s/g, "");
}

function codeError(message: string | undefined): string {
  if (message && /rate limit|too many/i.test(message)) {
    return "Too many tries. Please wait five minutes and try again.";
  }
  return "That code did not work. Enter the newest 6-digit code from your authenticator app.";
}

/**
 * After the code is accepted: check the account is switched on and signed in
 * the way its role requires (the database decides), then go in.
 */
async function finishSignIn(next: string, refused = "no-access"): Promise<never> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: me } = await supabase
    .from("app_users")
    .select("id")
    .eq("id", claims?.claims.sub ?? "")
    .maybeSingle();
  if (!me) {
    await supabase.auth.signOut({ scope: "local" });
    (await cookies()).delete(LAST_ACTIVE_COOKIE);
    redirect(`/sign-in?reason=${refused}`);
  }
  await markActive();
  redirect(next);
}

/** Step 1: email and password. */
export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  if (!email || !password) return { error: "Enter your email address and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/rate limit|too many/i.test(error.message)) {
      return { error: "Too many sign-in attempts. Please wait five minutes and try again." };
    }
    // Deliberately does not say which part was wrong.
    return { error: "That email and password do not match. Please try again." };
  }
  await markActive();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  redirect(withNext(factors?.totp.length ? "/sign-in/code" : "/sign-in/set-up", next));
}

/** Step 2: the 6-digit code from the authenticator app. */
export async function verifyCode(_state: FormState, form: FormData): Promise<FormState> {
  const code = cleanCode(form.get("code"));
  const next = safeNextPath(String(form.get("next") ?? ""));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (!factor) redirect(withNext("/sign-in/set-up", next));

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: codeError(error.message) };
  return finishSignIn(next);
}

export type SetUpState =
  | { stage: "start"; error: string | null }
  | { stage: "scan"; factorId: string; qrCode: string; secret: string };

/** First sign-in: create the authenticator key and QR code (button press only). */
export async function startSetUp(): Promise<SetUpState> {
  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { stage: "start", error: "Your sign-in has ended. Please go back and sign in again." };
  // Never used to add a second phone. (Supabase also refuses this.)
  if (factors.totp.length) return { stage: "start", error: "Two-factor sign-in is already set up for this account." };

  // Clear away any set-up that was started but never finished.
  for (const f of factors.all) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "ICCI authenticator",
    issuer: "ICCI Control Dashboard",
  });
  if (error || !data) {
    return { stage: "start", error: "Set-up could not start. Please try again. If it keeps happening, ask a Super Admin." };
  }
  return { stage: "scan", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** First sign-in: confirm the authenticator app was set up correctly. */
export async function confirmSetUp(_state: FormState, form: FormData): Promise<FormState> {
  const code = cleanCode(form.get("code"));
  const factorId = String(form.get("factorId") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code your authenticator app now shows." };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: codeError(error.message) };
  return finishSignIn(next);
}

/** Sign out: the "Sign out" button, or automatically after 15 minutes idle. */
export async function signOut(reason: "signed-out" | "idle" = "signed-out"): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(LAST_ACTIVE_COOKIE);
  redirect(`/sign-in?reason=${reason === "idle" ? "idle" : "signed-out"}`);
}

// ---------------------------------------------------------------------------
// Library sign-in with an emailed code (slice P4.1). No password, no
// authenticator app. The database lets only the Library Operator role in
// this way (migration 0034); anyone else is signed straight out again.

const PENDING_COOKIE_OPTIONS = {
  path: "/sign-in/library",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 10 * 60,
};

function looksLikeEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendCode(email: string): Promise<string | null> {
  const supabase = await createClient();
  // shouldCreateUser: false, so an unknown address never becomes an account.
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  // Only "too many requests from this device" is shown: it applies to every
  // address alike. Every other refusal (unknown address, "one code a
  // minute" for this account, email not delivered) is not shown, so the
  // screen never reveals who has an account.
  if (error?.code === "over_request_rate_limit") {
    return "Too many tries from this device. Please wait five minutes and try again.";
  }
  return null;
}

/** Library step 1: the email address. */
export async function sendLibraryCode(_state: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(String(form.get("next") ?? ""));
  if (!looksLikeEmail(email)) return { error: "Enter your email address, for example name@example.com." };

  const problem = await sendCode(email);
  if (problem) return { error: problem };
  (await cookies()).set(LIBRARY_PENDING_COOKIE, email, PENDING_COOKIE_OPTIONS);
  redirect(withNext("/sign-in/library/code", next));
}

/** Library step 2: the 6-digit code from the email. */
export async function verifyLibraryCode(_state: FormState, form: FormData): Promise<FormState> {
  const code = cleanCode(form.get("code"));
  const next = safeNextPath(String(form.get("next") ?? ""));
  const email = (await cookies()).get(LIBRARY_PENDING_COOKIE)?.value;
  if (!email) return { error: "This page has timed out. Go back and ask for a new code." };
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from the email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    if (/rate limit|too many/i.test(error.message)) {
      return { error: "Too many tries. Please wait five minutes and try again." };
    }
    return { error: "That code did not work. Use the newest code we emailed you, or ask for a new one. A code works once, for 10 minutes." };
  }
  (await cookies()).delete({ name: LIBRARY_PENDING_COOKIE, path: PENDING_COOKIE_OPTIONS.path });
  await markActive();
  return finishSignIn(next, "email-code-refused");
}

/** Library step 2: "Send me a new code". */
export async function resendLibraryCode(): Promise<FormState & { sent?: boolean }> {
  const email = (await cookies()).get(LIBRARY_PENDING_COOKIE)?.value;
  if (!email) return { error: "This page has timed out. Go back and enter your email address again." };
  const problem = await sendCode(email);
  if (problem) return { error: problem };
  (await cookies()).set(LIBRARY_PENDING_COOKIE, email, PENDING_COOKIE_OPTIONS);
  return { error: null, sent: true };
}
