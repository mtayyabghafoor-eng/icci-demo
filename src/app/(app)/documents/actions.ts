"use server";
// Adding and hiding manuals and documents (slice P1.20). The file is saved
// first (a new file each time), then the record; the database checks the
// file is really there. Nothing is ever replaced or deleted.
import { redirect } from "next/navigation";
import {
  DOCUMENT_BUCKET,
  DOCUMENT_MAX_MB,
  documentPath,
  friendlyDocumentError,
  parseDocumentForm,
  parseHideReason,
} from "@/lib/documents/rules";
import { fileFrom, PDF_OR_PICTURE_TYPES } from "@/lib/files";
import { formGetter, UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type DocumentFormState = { error: string | null };
export type DocumentOwner = { model_id: string } | { item_id: string };

/** Only back to a model or item page: never anywhere else. */
function safeReturn(path: string): string {
  return /^\/(models|items)\/[0-9a-f-]{36}$/.test(path) ? path : "/";
}

function ownerOk(owner: DocumentOwner): boolean {
  return UUID.test("model_id" in owner ? owner.model_id : owner.item_id);
}

export async function addDocument(owner: DocumentOwner, returnTo: string, _state: DocumentFormState, form: FormData): Promise<DocumentFormState> {
  if (!ownerOk(owner)) return { error: "This record could not be found." };
  const parsed = parseDocumentForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const file = await fileFrom(form, "file", {
    types: PDF_OR_PICTURE_TYPES,
    maxMb: DOCUMENT_MAX_MB,
    what: "file",
    typesText: "a PDF or a JPEG, PNG or WebP picture",
  });
  if (file === null) return { error: "Choose the file to add." };
  if (typeof file === "string") return { error: file };
  const supabase = await createClient();
  const path = documentPath(owner, file.ext);
  const up = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file.file, { contentType: file.file.type });
  if (up.error) return { error: "The file could not be saved. Please try again." };
  const { error } = await supabase.from("asset_documents").insert({ ...owner, ...parsed.values, file_path: path });
  if (error) return { error: friendlyDocumentError(error.message) };
  redirect(`${safeReturn(returnTo)}?done=document-added`);
}

export async function hideDocument(id: number, returnTo: string, _state: DocumentFormState, form: FormData): Promise<DocumentFormState> {
  const reason = parseHideReason(formGetter(form));
  if (!reason.ok) return { error: reason.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("asset_documents").update({ hidden: true, hidden_reason: reason.values }).eq("id", id).select("id");
  if (error) return { error: friendlyDocumentError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${safeReturn(returnTo)}?done=document-hidden`);
}
