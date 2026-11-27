// D7: a document's PDF (a manual, warranty card, service report), handed
// over by this website itself so the flip book can read it. The database
// decides who may read the document record and its file. Never kept by the
// browser.
import { DOCUMENT_BUCKET } from "@/lib/documents/rules";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return new Response("Not found.", { status: 404 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub || claims.claims.aal !== "aal2") return new Response("Please sign in.", { status: 401 });
  const { data: doc } = await supabase.from("asset_documents").select("file_path").eq("id", Number(id)).eq("hidden", false).maybeSingle();
  if (!doc?.file_path?.endsWith(".pdf")) return new Response("Not found.", { status: 404 });
  const { data: file, error } = await supabase.storage.from(DOCUMENT_BUCKET).download(doc.file_path);
  if (error || !file) return new Response("The PDF could not be read. Please try again.", { status: 502 });
  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="document-${id}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
