"use client";
// The receipt button (slice P5.2; docs/PHASE-5.md section 2): take a photo
// with the camera, OR choose photos or PDFs already on the device (saved
// from WhatsApp or an email), up to 3 files. Unlike the item photo button,
// pictures stay sharp enough to read a long till receipt: they are only made
// smaller above 3,000 pixels on the long side. The server checks every file
// again by its content.
import { Camera, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";

const MAX_SIDE = 3000;
export const RECEIPT_MAX_FILES = 3;

type Picked = { file: File; preview: string | null };

/** A picture made smaller only if it is very large; anything else is left as it is. */
async function prepare(file: File, n: number): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const long = Math.max(bitmap.width, bitmap.height);
    // Already a JPEG, PNG or WebP of a sensible size: send it untouched.
    if (long <= MAX_SIDE && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
    const scale = Math.min(1, MAX_SIDE / long);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ? new File([blob], `receipt-${n}.jpg`, { type: "image/jpeg" }) : file;
  } catch {
    return file; // the server still checks the type and size
  }
}

export function ReceiptInput({ onChange, disabled = false }: { onChange: (files: File[]) => void; disabled?: boolean }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const full = picked.length >= RECEIPT_MAX_FILES;

  useEffect(() => () => picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), [picked]);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const room = RECEIPT_MAX_FILES - picked.length;
    const next = [...picked];
    for (const f of [...list].slice(0, room)) {
      const ready = await prepare(f, next.length + 1);
      next.push({ file: ready, preview: ready.type.startsWith("image/") ? URL.createObjectURL(ready) : null });
    }
    setBusy(false);
    setPicked(next);
    onChange(next.map((p) => p.file));
  }

  function remove(i: number) {
    const next = picked.filter((_, k) => k !== i);
    setPicked(next);
    onChange(next.map((p) => p.file));
  }

  const button = buttonClass("outline", "md", "max-md:min-h-12 w-full sm:w-auto cursor-pointer");
  return (
    <div data-testid="receipt-input">
      <div className="flex flex-wrap gap-2">
        <label className={`${button} ${full || disabled ? "pointer-events-none opacity-50" : ""}`}>
          <Camera aria-hidden size={18} />
          {busy ? "Preparing…" : "Take a photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={full || disabled}
            data-testid="receipt-camera"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <label className={`${button} ${full || disabled ? "pointer-events-none opacity-50" : ""}`}>
          <FileText aria-hidden size={18} />
          Choose photos or PDFs
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/*,application/pdf"
            multiple
            className="sr-only"
            disabled={full || disabled}
            data-testid="receipt-choose"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="mt-1.5 text-sm text-icci-ink-60">
        Up to {RECEIPT_MAX_FILES} files, 10 MB each: a photo, or a picture or PDF saved from WhatsApp or an email.
      </p>
      {picked.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3" data-testid="receipt-picked">
          {picked.map((p, i) => (
            <li key={`${p.file.name}-${i}`} className="relative">
              {p.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview, not a web image
                <img src={p.preview} alt={`Receipt file ${i + 1}`} className="h-28 w-24 rounded-xl border border-icci-line object-cover" />
              ) : (
                <span className="flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-icci-line bg-icci-panel px-1 text-center text-xs">
                  <FileText aria-hidden size={22} />
                  <span className="line-clamp-3 break-all">{p.file.name}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove receipt file ${i + 1}`}
                className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border border-icci-line bg-white shadow-sm"
              >
                <X aria-hidden size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
