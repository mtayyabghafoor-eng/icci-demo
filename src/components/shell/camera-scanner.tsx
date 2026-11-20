"use client";
// Scan a label with the camera inside the app (slice UI-7). Uses the QR
// reader built into the browser (Chrome on Android has one), so nothing new
// is added to the project. Where the browser has none (for example iPhone
// Safari) this shows nothing and the page's "use the Camera app" steps apply.
// Only an ICCI item or place label number is ever taken from a code
// (codeFromScan, slice P1.12); the
// app then opens its own label page. The camera stops as soon as a label is
// read, when Stop is pressed, or when the page is left. Nothing is recorded.
import { useRouter } from "next/navigation";
import { Camera, CameraOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { codeFromScan } from "@/lib/items/scan";

// The browser's QR reader is not in TypeScript's built-in list yet.
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

function browserDetector(): DetectorClass | null {
  if (typeof window === "undefined") return null;
  const D = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  return D && typeof navigator.mediaDevices?.getUserMedia === "function" ? D : null;
}

/** What a camera scanner looks for, and where it goes when it finds it. */
export type ScanTarget = {
  /** The browser reader's kinds of code, for example "qr_code" or "ean_13" (book barcodes). */
  formats: string[];
  /** The value to use from a code, or null if the code is not the right kind. */
  accept: (raw: string) => string | null;
  /** The page to open with the value. */
  hrefFor: (value: string) => string;
  title: string;
  hint: string;
  wrongCode: string;
  testId: string;
};

const LABELS: ScanTarget = {
  formats: ["qr_code"],
  accept: codeFromScan,
  hrefFor: (path) => path,
  title: "Scan with this phone",
  hint: "Point the camera at the square code on an ICCI label. It opens by itself.",
  wrongCode: "That code is not an ICCI label. Point the camera at the square code on an ICCI label.",
  testId: "camera-scanner",
};

/** Scans an ICCI label (the QR code) and opens its page. */
export function CameraScanner() {
  return <BarcodeCamera target={LABELS} />;
}

/** The camera scanner itself, for any kind of code (labels, book barcodes in slice P4.3). */
export function BarcodeCamera({ target }: { target: ScanTarget }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setOn(false);
  };

  useEffect(() => {
    // Decided in the browser only, after the first drawing of the page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(browserDetector() !== null);
    return stop;
  }, []);

  const start = async () => {
    const Detector = browserDetector();
    if (!Detector || !video.current) return;
    setMessage(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch {
      setMessage("The camera could not be opened. Allow camera use for this site, or type the number instead.");
      return;
    }
    video.current.srcObject = stream.current;
    await video.current.play().catch(() => undefined);
    setOn(true);
    const detector = new Detector({ formats: target.formats });
    let busy = false;
    timer.current = window.setInterval(async () => {
      if (busy || !video.current || video.current.readyState < 2) return;
      busy = true;
      try {
        const codes = await detector.detect(video.current);
        for (const code of codes) {
          const value = target.accept(code.rawValue);
          if (value) {
            stop();
            router.push(target.hrefFor(value));
            return;
          }
          setMessage(target.wrongCode);
        }
      } catch {
        // One unreadable frame: try the next one.
      } finally {
        busy = false;
      }
    }, 300);
  };

  if (!supported) return null;
  return (
    <section className="rounded-2xl border border-icci-gold-300 bg-white p-5 shadow-card" data-testid={target.testId}>
      <h2 className="text-lg font-bold">{target.title}</h2>
      <p className="mt-1 text-[15px] text-icci-ink-60">{target.hint}</p>
      <div className={on ? "mt-4 overflow-hidden rounded-xl bg-icci-green-900" : "hidden"}>
        <video ref={video} muted playsInline aria-label="Camera view" className="aspect-square w-full object-cover" />
      </div>
      {message && (
        <p role="status" className="mt-3 rounded-xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3 text-[15px]">
          {message}
        </p>
      )}
      <div className="mt-4">
        {on ? (
          <button type="button" onClick={stop} className={buttonClass("outline", "lg", "w-full")}>
            <CameraOff aria-hidden size={18} /> Stop the camera
          </button>
        ) : (
          <button type="button" onClick={start} className={buttonClass("primary", "lg", "w-full")}>
            <Camera aria-hidden size={18} /> Start the camera
          </button>
        )}
      </div>
    </section>
  );
}
