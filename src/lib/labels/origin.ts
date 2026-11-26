// The address put inside QR codes on printed labels (item labels, slice 7;
// place labels, slice P1.12).
//
// Round C3: it comes from a fixed setting, never from the request, so a
// tampered request can never print labels that lead to another website.
// In order: SITE_URL (.env.local or the web host's settings), else the web
// host's own permanent address for the project (set by Vercel), else this
// PC (http://localhost:3000).
type Env = Record<string, string | undefined>;

export function labelOrigin(env: Env = process.env): string {
  const candidates = [
    env.SITE_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
  ];
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    try {
      const url = new URL(raw.trim());
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Not an address: try the next one.
    }
  }
  return "http://localhost:3000";
}
