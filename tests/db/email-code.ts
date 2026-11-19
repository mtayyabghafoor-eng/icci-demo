// The Library Operator's way of signing in (slice P4.1), for the tests.
import { createClient } from "@supabase/supabase-js";

export type TestSession = { accessToken: string; refreshToken: string; userId: string };

/**
 * Signs in with an emailed one-time code, the Library Operator's way. The
 * code is asked for with the master key (no email is sent), then typed in
 * with the public key exactly as the sign-in screen does.
 */
export async function emailCodeSession(url: string, publicKey: string, email: string): Promise<TestSession> {
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, options);
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties?.email_otp) throw new Error(`No emailed code for ${email}: ${linkError?.message}`);
  const client = createClient(url, publicKey, options);
  const { data, error } = await client.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" });
  if (error || !data.session || !data.user) throw new Error(`Emailed code refused for ${email}: ${error?.message}`);
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, userId: data.user.id };
}
