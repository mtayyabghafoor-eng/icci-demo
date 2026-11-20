// The address the app is open on, put inside QR codes on printed labels
// (item labels, slice 7; place labels, slice P1.12).
import { headers } from "next/headers";

export async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host}`;
}
