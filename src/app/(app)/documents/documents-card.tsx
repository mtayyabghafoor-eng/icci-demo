// The documents of a make and model or of one item (slice P1.20): each one
// opens through a private link that lasts 10 minutes. Admins add more and
// hide a wrong one with a reason. Used on the model page and the item page.
import Link from "next/link";
import { BookOpen, FileText, ImageIcon } from "lucide-react";
import { Card, CardTitle } from "@/components/ui";
import { DOCUMENT_BUCKET, DOCUMENT_COLUMNS, DOCUMENT_KINDS, type DocumentRow } from "@/lib/documents/rules";
import { formatDate } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import type { DocumentOwner } from "./actions";
import { AddDocumentForm, HideDocumentForm } from "./forms";

/** The documents shown for an owner, newest first, each with its private link. */
export async function documentsOf(owner: DocumentOwner): Promise<(DocumentRow & { url: string | null })[]> {
  const supabase = await createClient();
  const column = "model_id" in owner ? "model_id" : "item_id";
  const value = "model_id" in owner ? owner.model_id : owner.item_id;
  const { data } = await supabase.from("asset_documents").select(DOCUMENT_COLUMNS).eq(column, value).eq("hidden", false).order("id", { ascending: false });
  const docs = (data ?? []) as DocumentRow[];
  if (!docs.length) return [];
  const { data: signed } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrls(docs.map((d) => d.file_path), 600);
  return docs.map((d, i) => ({ ...d, url: signed?.[i]?.signedUrl ?? null }));
}

export function DocumentList({
  docs,
  returnTo,
  canHide = true,
  markModel = false,
}: {
  docs: (DocumentRow & { url: string | null })[];
  returnTo?: string;
  /** E7: on an item page only the item's own documents can be hidden there. */
  canHide?: boolean | ((d: DocumentRow) => boolean);
  /** E7: say which documents belong to the make and model. */
  markModel?: boolean;
}) {
  return (
    <ul className="divide-y divide-icci-line" data-testid="documents">
      {docs.map((d) => {
        const Icon = d.file_path.endsWith(".pdf") ? FileText : ImageIcon;
        return (
          <li key={d.id} className="py-2.5">
            {/* Round E fix: the title on its own line, then what it is and when it was added. */}
            <p className="flex items-start gap-2">
              <Icon aria-hidden size={18} className="mt-0.5 shrink-0 text-icci-green-dark" />
              {d.url ? (
                <a dir="auto" href={d.url} target="_blank" rel="noopener noreferrer" className="font-semibold">
                  {d.title}
                </a>
              ) : (
                <span dir="auto" className="font-semibold">{d.title}</span>
              )}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 ps-[26px] text-sm text-icci-ink-60">
              <span>
                {DOCUMENT_KINDS[d.kind]}
                {markModel && d.model_id ? " for every one of this model" : ""} · added {formatDate(d.created_at)}
              </span>
              {/* D7: a PDF also reads as a book. */}
              {d.file_path.endsWith(".pdf") && (
                <Link href={`/documents/${d.id}/book`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold">
                  <BookOpen aria-hidden size={16} />
                  Read as a book
                </Link>
              )}
            </p>
            {(typeof canHide === "function" ? canHide(d) : canHide) && returnTo && <HideDocumentForm id={d.id} title={d.title} returnTo={returnTo} />}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * E7: on an item page, one card for every document: its make and model's
 * manuals (kept once for every unit, hidden from the model page) and the
 * item's own papers. Before, the model's manuals were listed twice.
 */
export async function DocumentsCard({ owner, returnTo, modelId }: { owner: DocumentOwner; returnTo: string; modelId?: string | null }) {
  const forModel = "model_id" in owner;
  const [own, ofModel] = await Promise.all([documentsOf(owner), !forModel && modelId ? documentsOf({ model_id: modelId }) : []]);
  const docs = [...ofModel, ...own];
  return (
    <Card>
      <CardTitle>Manuals and documents</CardTitle>
      <p className="text-sm text-icci-ink-60">
        {forModel
          ? "Kept once for every unit of this model: manuals, spec sheets, the maker's warranty terms."
          : "The make and model's manuals, and this item's own papers: its warranty card, invoice, service reports, a photo of the maker's plate."}
      </p>
      {docs.length === 0 ? (
        <p className="mt-2">None added yet.</p>
      ) : (
        <DocumentList docs={docs} returnTo={returnTo} canHide={forModel ? true : (d) => d.item_id !== null} markModel={!forModel} />
      )}
      <details className="mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Add a document</summary>
        <AddDocumentForm owner={owner} returnTo={returnTo} defaultKind={forModel ? "manual" : "warranty"} />
      </details>
    </Card>
  );
}
