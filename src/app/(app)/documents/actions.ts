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
import { formGetter } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { NOT_FOUND, anyBad, isId, isUuid } from "@/lib/action-input";

export type DocumentFormState = { error: string | null };
export type DocumentOwner = { model_id: string } | { item_id: string };

/** Only back to a model or item page: never anywhere else. */
function safeReturn(path: string): string {
  return /^\/(models|items)\/[0-9a-f-]{36}$/.test(path) ? path : "/";
}

/**
 * Round C3: exactly one of the two expected fields, a real id, and nothing
 * else. Whatever else the browser sends is never passed on to the database.
 */
function cleanOwner(owner: unknown): DocumentOwner | null {
  if (!owner || typeof owner !== "object" || Object.keys(owner).length !== 1) return null;
  const o = owner as Record<string, unknown>;
  if (isUuid(o.model_id)) return { model_id: o.model_id };
  if (isUuid(o.item_id)) return { item_id: o.item_id };
  return null;
}

export async function addDocument(rawOwner: DocumentOwner, returnTo: string, _state: DocumentFormState, form: FormData): Promise<DocumentFormState> {
  const owner = cleanOwner(rawOwner);
  if (!owner || typeof returnTo !== "string") return { error: "This record could not be found." };
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
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isId(id))) return { error: NOT_FOUND };
  const reason = parseHideReason(formGetter(form));
  if (!reason.ok) return { error: reason.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("asset_documents").update({ hidden: true, hidden_reason: reason.values }).eq("id", id).select("id");
  if (error) return { error: friendlyDocumentError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${safeReturn(returnTo)}?done=document-hidden`);
}
