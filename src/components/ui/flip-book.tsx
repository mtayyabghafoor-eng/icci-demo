"use client";
// D7 (owner, 27 Nov 2026): a PDF read as a book, like heyzine.com, but
// inside this app so the document never leaves ICCI's storage. English
// turns from left to right; Arabic from right to left (the spine on the
// right, pages lifting from the left). On a PC two pages face each other;
// on a phone one page at a time. Turn with the buttons, the arrow keys, a
// tap on a page's outer half, or a swipe. Pages are drawn on this device by
// Mozilla's free PDF reader (pdfjs-dist), a few at a time.
import { ArrowLeft, ArrowRight, Download, Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/ui/text";
import { buttonClass } from "./button";

type Doc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; canvas: HTMLCanvasElement }) => { promise: Promise<void> };
};

const TURN_MS = 650;

/** Which pages face each other. null = the empty side beside the cover or the back. */
function spreadsOf(pages: number, double: boolean): Array<[number | null, number | null]> {
  if (!double) return Array.from({ length: pages }, (_, i) => [i + 1, null]);
  // [near the reader's start, far]: for English that is [left, right].
  const out: Array<[number | null, number | null]> = [[null, 1]];
  for (let p = 2; p <= pages; p += 2) out.push([p, p + 1 <= pages ? p + 1 : null]);
  return out;
}

export function FlipBook({ src, dir, title, downloadName }: { src: string; dir: "ltr" | "rtl"; title: string; downloadName: string }) {
  const rtl = dir === "rtl";
  const frame = useRef<HTMLDivElement>(null);
  const doc = useRef<Doc | null>(null);
  const [pages, setPages] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [images, setImages] = useState<Record<number, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [double, setDouble] = useState(true);
  const [at, setAt] = useState(0);
  const [turn, setTurn] = useState<{ to: number; forward: boolean; go: boolean } | null>(null);
  const [full, setFull] = useState(false);
  const drawing = useRef(new Set<number>());

  // Load the PDF once.
  useEffect(() => {
    let gone = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const loading = pdfjs.getDocument({ url: src, withCredentials: true });
        task = loading;
        const loaded = (await loading.promise) as unknown as Doc;
        if (gone) return;
        doc.current = loaded;
        const first = await loaded.getPage(1);
        const v = first.getViewport({ scale: 1 });
        setRatio(v.height / v.width);
        setPages(loaded.numPages);
      } catch {
        if (!gone) setProblem("This PDF could not be opened as a book. Use “Open the PDF” instead.");
      }
    })();
    return () => {
      gone = true;
      // Lets the PDF reader's helper thread go; a failure here changes nothing on screen.
      void task?.destroy().catch(() => undefined);
      doc.current = null;
    };
  }, [src]);

  // Two pages side by side on wider screens, one on a phone.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 48rem)");
    const set = () => setDouble(wide.matches);
    set();
    wide.addEventListener("change", set);
    return () => wide.removeEventListener("change", set);
  }, []);

  const spreads = useMemo(() => spreadsOf(pages, double), [pages, double]);
  const last = Math.max(0, spreads.length - 1);
  const here = Math.min(at, last);

  // Draw the pages near the open spread (and the next and previous ones).
  const draw = useCallback(async (n: number) => {
    const d = doc.current;
    if (!d || n < 1 || n > d.numPages || drawing.current.has(n)) return;
    drawing.current.add(n);
    try {
      const page = await d.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, (1100 / base.width) * Math.min(2, window.devicePixelRatio || 1));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (blob) setImages((was) => ({ ...was, [n]: URL.createObjectURL(blob) }));
    } catch {
      drawing.current.delete(n);
    }
  }, []);
  useEffect(() => {
    // Drawing happens on another thread; each page's picture arrives later.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const s of [here - 1, here, here + 1, here + 2]) for (const p of spreads[s] ?? []) if (p) void draw(p);
  }, [here, spreads, draw, pages]);
  useEffect(() => () => Object.values(images).forEach((u) => URL.revokeObjectURL(u)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback(
    (forward: boolean) => {
      if (turn) return;
      const to = here + (forward ? 1 : -1);
      if (to < 0 || to > last) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setAt(to);
      setTurn({ to, forward, go: false });
      requestAnimationFrame(() => requestAnimationFrame(() => setTurn({ to, forward, go: true })));
      window.setTimeout(() => {
        setAt(to);
        setTurn(null);
      }, TURN_MS);
    },
    [here, last, turn],
  );

  // Arrow keys follow the reading direction: in Arabic, the left arrow goes on.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(!rtl);
      else if (e.key === "ArrowLeft") go(rtl);
      else if (e.key === "Home") setAt(0);
      else if (e.key === "End") setAt(last);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, rtl, last]);

  // Swipe: the finger pulls the page the way it turns.
  const swipe = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => (swipe.current = e.clientX);
  const onPointerUp = (e: React.PointerEvent) => {
    if (swipe.current === null) return;
    const dx = e.clientX - swipe.current;
    swipe.current = null;
    if (Math.abs(dx) < 40) return;
    go(rtl ? dx > 0 : dx < 0);
  };

  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  // [left, right] on screen for a spread: Arabic shows its pages mirrored.
  const onScreen = (s: number): [number | null, number | null] => {
    const [a, b] = spreads[s] ?? [null, null];
    if (!double) return [a, null];
    return rtl ? [b, a] : [a, b];
  };

  const page = (n: number | null, side: "left" | "right" | "single") => (
    <div
      className={cx(
        "relative h-full w-full overflow-hidden",
        n !== null && "bg-white",
        n !== null && side === "left" && "rounded-l-md shadow-[inset_-18px_0_24px_-18px_rgb(0_0_0/0.25)]",
        n !== null && side === "right" && "rounded-r-md shadow-[inset_18px_0_24px_-18px_rgb(0_0_0/0.25)]",
        n !== null && side === "single" && "rounded-md",
      )}
    >
      {n !== null &&
        (images[n] ? (
          // eslint-disable-next-line @next/next/no-img-element -- drawn on this device from the PDF
          <img src={images[n]} alt={`Page ${n} of ${pages}`} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-icci-ink-60">Page {n}…</div>
        ))}
    </div>
  );

  // During a turn: the page underneath, and the leaf that lifts and turns.
  const [curL, curR] = onScreen(here);
  const target = turn ? onScreen(turn.to) : null;
  // The side the leaf starts on: English forward lifts the right page; Arabic forward lifts the left.
  const leafRight = turn ? (turn.forward ? !rtl : rtl) : false;
  const under: [number | null, number | null] = turn && target ? (double ? (leafRight ? [curL, target[1]] : [target[0], curR]) : [target[0], null]) : [curL, curR];
  const leafFront = turn ? (double ? (leafRight ? curR : curL) : curL) : null;
  const leafBack = turn && target ? (double ? (leafRight ? target[0] : target[1]) : null) : null;

  const pageLine =
    pages === 0
      ? ""
      : double
        ? (() => {
            const shown = (spreads[here] ?? []).filter((p): p is number => p !== null).sort((x, y) => x - y);
            return shown.length === 2 ? `Pages ${shown[0]} and ${shown[1]} of ${pages}` : `Page ${shown[0]} of ${pages}`;
          })()
        : `Page ${here + 1} of ${pages}`;

  const Back = rtl ? ArrowRight : ArrowLeft;
  const On = rtl ? ArrowLeft : ArrowRight;
  const backButton = (
    <button type="button" onClick={() => go(false)} disabled={here === 0 || !!turn} className={buttonClass("outline")} aria-label="Previous page">
      <Back aria-hidden size={18} />
      <span className="max-sm:sr-only">Previous</span>
    </button>
  );
  const onButton = (
    <button type="button" onClick={() => go(true)} disabled={here >= last || !!turn} className={buttonClass("primary")} aria-label="Next page">
      <span className="max-sm:sr-only">Next</span>
      <On aria-hidden size={18} />
    </button>
  );

  return (
    <section
      ref={frame}
      aria-label={title}
      data-testid="flip-book"
      data-dir={dir}
      data-pages={pages}
      className={cx("flex flex-col gap-4", full && "h-full justify-center bg-icci-green-900 p-4")}
    >
      {problem ? (
        <p role="alert" className="rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3">
          {problem}
        </p>
      ) : (
        <div
          className="relative mx-auto w-full select-none rounded-2xl bg-gradient-to-b from-icci-green-dark to-icci-green-900 p-3 shadow-raised sm:p-6"
          style={{ maxWidth: double ? `min(100%, calc((100vh - 21rem) / ${ratio} * 2 + 3rem))` : `min(100%, calc((100vh - 24rem) / ${ratio} + 1.5rem))` }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <div className="relative grid [perspective:2200px]" style={{ gridTemplateColumns: double ? "1fr 1fr" : "1fr", aspectRatio: `${double ? 2 : 1} / ${ratio}` }}>
            {pages === 0 ? (
              <div className="col-span-full flex items-center justify-center text-white/80" role="status">
                Opening the book…
              </div>
            ) : (
              <>
                {/* A tap on a page's half turns that way (the keys and buttons do the same for everyone). */}
                <div onClick={() => go(rtl)} className="contents">
                  {page(under[0], double ? "left" : "single")}
                </div>
                {double && (
                  <div onClick={() => go(!rtl)} className="contents">
                    {page(under[1], "right")}
                  </div>
                )}
                {double && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/20" />}
                {turn && (
                  <div
                    aria-hidden
                    className={cx("absolute inset-y-0 [transform-style:preserve-3d]", double ? "w-1/2" : "inset-x-0", double && (leafRight ? "right-0" : "left-0"))}
                    style={{
                      transformOrigin: double ? (leafRight ? "left center" : "right center") : rtl ? "right center" : "left center",
                      transform: turn.go
                        ? double
                          ? `rotateY(${leafRight ? -180 : 180}deg)`
                          : `translateX(${(turn.forward ? -1 : 1) * (rtl ? -1 : 1) * 105}%) rotateY(${(turn.forward ? -1 : 1) * (rtl ? -1 : 1) * 25}deg)`
                        : "none",
                      transition: `transform ${TURN_MS}ms cubic-bezier(.3,.7,.2,1), opacity ${TURN_MS}ms`,
                      opacity: !double && turn.go ? 0 : 1,
                    }}
                  >
                    <div className="absolute inset-0 [backface-visibility:hidden]">
                      {page(leafFront, double ? (leafRight ? "right" : "left") : "single")}
                    </div>
                    {double && (
                      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                        {page(leafBack, leafRight ? "left" : "right")}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className={cx("flex flex-wrap items-center justify-between gap-3", full && "text-white")}>
        {/* The button that goes on sits on the side the pages turn towards. */}
        <div className="flex items-center gap-2">{rtl ? onButton : backButton}</div>
        <p className="text-[15px] font-semibold" aria-live="polite" data-testid="flip-page-line">
          {pageLine}
        </p>
        <div className="flex items-center gap-2">{rtl ? backButton : onButton}</div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <a href={src} download={downloadName} className={buttonClass("ghost")}>
          <Download aria-hidden size={18} />
          Open the PDF
        </a>
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : frame.current?.requestFullscreen())}
        >
          {full ? <Minimize2 aria-hidden size={18} /> : <Maximize2 aria-hidden size={18} />}
          {full ? "Leave full screen" : "Full screen"}
        </button>
      </div>
    </section>
  );
}
