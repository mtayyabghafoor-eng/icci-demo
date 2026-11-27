"use client";
// "Take a photo" opens the phone camera in one tap; D3: "Choose from photos"
// opens the phone's gallery (a WhatsApp photo, one taken earlier) or a file
// picker on a PC, and "Remove photo" takes a wrong one away before saving.
// The photo is made smaller on the device before it is sent, so it uploads
// quickly on a phone connection. No extra software is needed.
import { Camera, Images, X } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";

const MAX_SIDE = 1600;

export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // the server still checks the type and size
  }
}

export function PhotoInput({ label, onPhoto }: { label: string; onPhoto: (file: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function picked(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setBusy(true);
    const small = await shrinkPhoto(file);
    setBusy(false);
    setPreview(URL.createObjectURL(small));
    onPhoto(small);
  }

  const button = buttonClass("outline", "md", "max-md:min-h-12 flex-1 sm:flex-none cursor-pointer");
  return (
    <div>
      <span className="font-semibold">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        <label className={button}>
          <Camera aria-hidden size={18} />
          {busy ? "Preparing photo…" : preview ? "Take a different photo" : "Take a photo"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" data-testid="photo-input" onChange={(e) => void picked(e.currentTarget)} />
        </label>
        <label className={button}>
          <Images aria-hidden size={18} />
          Choose from photos
          <input type="file" accept="image/*" className="sr-only" data-testid="photo-choose" onChange={(e) => void picked(e.currentTarget)} />
        </label>
      </div>
      {preview && (
        <div className="mt-2 flex items-end gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a web image */}
          <img src={preview} alt="Preview of the new photo" className="h-32 w-32 rounded-xl border border-icci-line object-cover" />
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              onPhoto(null);
            }}
            className={buttonClass("ghost", "md")}
          >
            <X aria-hidden size={18} />
            Remove photo
          </button>
        </div>
      )}
    </div>
  );
}
