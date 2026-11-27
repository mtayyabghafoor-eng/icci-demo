// D7: one policy version's PDF (English, or Arabic with ?lang=ar), handed
// over by this website itself so the flip book can read it (the browser
// rules allow reading files from this website only). The gatekeeper
// (src/proxy.ts) sends signed-out visitors to sign in first; the database
// decides who may read the version and its file (Super Admin and Centre
// Admin). Never kept by the browser.
import { POLICY_BUCKET } from "@/lib/policies/rules";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/forms";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  if (!UUID.test(id) || !UUID.test(versionId)) return new Response("Not found.", { status: 404 });
  const lang = new URL(request.url).searchParams.get("lang") === "ar" ? "ar" : "en";

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub || claims.claims.aal !== "aal2") return new Response("Please sign in.", { status: 401 });

  const { data: version } = await supabase
    .from("policy_versions")
    .select("file_path, file_path_ar")
    .eq("id", versionId)
    .eq("policy_id", id)
    .maybeSingle();
  const path = lang === "ar" ? version?.file_path_ar : version?.file_path;
  if (!path) return new Response("Not found.", { status: 404 });

  const { data: file, error } = await supabase.storage.from(POLICY_BUCKET).download(path);
  if (error || !file) return new Response("The PDF could not be read. Please try again.", { status: 502 });
  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="policy-${lang}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
