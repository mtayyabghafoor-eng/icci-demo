"use client";
// "Take a photo": opens the phone camera in one tap (or a file picker on a
// PC). The photo is made smaller on the device before it is sent, so it
// uploads quickly on a phone connection. No extra software is needed.
import { useEffect, useState } from "react";

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

  return (
    <div>
      <span className="font-semibold">{label}</span>
      <label className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 py-2 font-semibold text-icci-green! no-underline transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 mt-1 cursor-pointer">
        {busy ? "Preparing photo…" : preview ? "Take a different photo" : "Take a photo"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          data-testid="photo-input"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            const small = await shrinkPhoto(file);
            setBusy(false);
            setPreview(URL.createObjectURL(small));
            onPhoto(small);
          }}
        />
      </label>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview, not a web image
        <img src={preview} alt="Preview of the new photo" className="mt-2 h-32 w-32 rounded-xl border border-icci-line object-cover" />
      )}
    </div>
  );
}
