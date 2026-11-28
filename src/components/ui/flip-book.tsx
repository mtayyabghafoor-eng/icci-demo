"use client";
// D7 (owner, 27 Nov 2026): a PDF read as a book, like heyzine.com, but
// inside this app so the document never leaves ICCI's storage. English
// turns from left to right; Arabic from right to left (the spine on the
// right, pages lifting from the left). On a PC two pages face each other;
// on a phone one page at a time, as wide as the screen. Turn with the
// buttons, the arrow keys, a tap on a page's outer half, or a swipe. Pages
// are drawn on this device by Mozilla's free PDF reader (pdfjs-dist).
//
// D8 (owner, 27 Nov 2026, "I can't read it, there is no zoom"): zoom up to
// four times with the + and − buttons, the + and − keys, a pinch, a
// double-tap (or double-click) on the spot to read, or Ctrl and the mouse
// wheel. While zoomed, drag (or scroll) to move around the page; taps and
// swipes stop turning pages until "Fit page". Each page is drawn again,
// sharper, once the zoom settles, so small print stays crisp.
//
// Round E (owner, 27 Nov 2026, "like a minute document; full screen does
// not cover the screen; zoom makes one part bigger only"): the book now
// fills the width and the rest of the screen's height (all of it in full
// screen), with the buttons in one bar above it. Zoom makes the whole page
// bigger, evenly, inside that area. "Fit width" fills the width; on a PC
// "One page" shows a single page as wide as the screen.
import { ArrowLeft, ArrowRight, BookOpen, Download, FileText, Maximize2, Minimize2, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/ui/text";
import { buttonClass } from "./button";

type Doc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; canvas: HTMLCanvasElement }) => { promise: Promise<void> };
};
type Picture = { url: string; w: number };

const TURN_MS = 650;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
const TAP_MS = 300;

/** Which pages face each other. null = the empty side beside the cover or the back. */
function spreadsOf(pages: number, double: boolean): Array<[number | null, number | null]> {
  if (!double) return Array.from({ length: pages }, (_, i) => [i + 1, null]);
  // [near the reader's start, far]: for English that is [left, right].
  const out: Array<[number | null, number | null]> = [[null, 1]];
  for (let p = 2; p <= pages; p += 2) out.push([p, p + 1 <= pages ? p + 1 : null]);
  return out;
}

/** The zoom the buttons and gestures may reach, in quarter steps for buttons. */
function clampZoom(z: number, fine: boolean | "exact") {
  if (fine === "exact") return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  const step = fine ? 0.05 : 0.25;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z / step) * step));
}

export function FlipBook({ src, dir, title, downloadName }: { src: string; dir: "ltr" | "rtl"; title: string; downloadName: string }) {
  const rtl = dir === "rtl";
  const frame = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const doc = useRef<Doc | null>(null);
  const [pages, setPages] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [images, setImages] = useState<Record<number, Picture>>({});
  const imagesRef = useRef<Record<number, Picture>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [wide, setWide] = useState(true);
  const [onePage, setOnePage] = useState(false);
  const double = wide && !onePage;
  const bar = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  /** The room the book has on screen (CSS pixels), measured. */
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [at, setAt] = useState(0);
  const [turn, setTurn] = useState<{ to: number; forward: boolean; go: boolean } | null>(null);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [settled, setSettled] = useState(1);
  const zoomRef = useRef(1);
  const scrollTo = useRef<{ x: number; y: number } | null>(null);
  const drawing = useRef(new Set<string>());

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
    const set = () => setWide(wide.matches);
    set();
    wide.addEventListener("change", set);
    return () => wide.removeEventListener("change", set);
  }, []);

  // The room the book has: the whole width, and the screen's height below
  // the top bar and the button bar (all of the screen in full screen).
  // On a phone (not full screen) the page is as wide as the screen and the
  // page scrolls down, as before.
  const fill = wide || full;
  useEffect(() => {
    const o = outer.current;
    if (!o) return;
    const measure = () => {
      const style = getComputedStyle(o);
      const w = o.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const top = full ? 0 : ((document.querySelector("header.sticky") as HTMLElement | null)?.offsetHeight ?? 0);
      const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const h = window.innerHeight - top - (bar.current?.offsetHeight ?? 0) - pad - (full ? 48 : 28);
      setArea({ w: Math.max(0, Math.floor(w)), h: Math.max(320, Math.floor(h)) });
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(o);
    if (bar.current) seen.observe(bar.current);
    window.addEventListener("resize", measure);
    return () => {
      seen.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [problem, full]);
  const cols = double ? 2 : 1;
  /** The book's width when the whole spread (or page) fits: zoom 100%. */
  const fit = area.w === 0 ? 0 : fill ? Math.min(area.w, (area.h * cols) / ratio) : area.w;
  /** The zoom at which the book is exactly as wide as the room. */
  const widthZoom = fit > 0 ? area.w / fit : 1;

  const spreads = useMemo(() => spreadsOf(pages, double), [pages, double]);
  const last = Math.max(0, spreads.length - 1);
  const here = Math.min(at, last);

  // ---- Zoom -------------------------------------------------------------
  /** Zoom to z, keeping the point under the finger (or the middle) still. */
  const zoomTo = useCallback((next: number, point?: { x: number; y: number }, fine: boolean | "exact" = false) => {
    const v = view.current;
    const old = zoomRef.current;
    const z = clampZoom(next, fine);
    if (!v || z === old) return;
    const box = v.getBoundingClientRect();
    const fx = point ? point.x - box.left : box.width / 2;
    const fy = point ? point.y - box.top : box.height / 2;
    const k = z / old;
    scrollTo.current = { x: (v.scrollLeft + fx) * k - fx, y: (v.scrollTop + fy) * k - fy };
    zoomRef.current = z;
    setZoom(z);
  }, []);
  // Zooming in from the whole spread: beside the cover (or the back) one
  // side is empty, so zoom towards the page, not the empty middle.
  const towardsPage = useCallback((): { x: number; y: number } | undefined => {
    const v = view.current;
    if (!v || !double) return undefined;
    const [a, b] = spreads[here] ?? [null, null];
    const [l, r] = rtl ? [b, a] : [a, b];
    if (l !== null && r !== null) return undefined;
    const box = v.getBoundingClientRect();
    // Hold the page's outer edge still, so from 200% the page fills the view.
    return { x: l === null ? box.right : box.left, y: box.top + box.height / 2 };
  }, [double, spreads, here, rtl]);
  useLayoutEffect(() => {
    const v = view.current;
    const s = scrollTo.current;
    if (v && s) {
      v.scrollLeft = Math.max(0, s.x);
      v.scrollTop = Math.max(0, s.y);
    }
    scrollTo.current = null;
  }, [zoom]);
  // Redraw sharper only once the zoom stops changing (a pinch moves it a lot).
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(zoom), 250);
    return () => window.clearTimeout(t);
  }, [zoom]);

  // ---- Drawing pages ------------------------------------------------------
  /** Draw page n w pixels wide, unless a picture that sharp is already there. */
  const draw = useCallback(async (n: number, w: number) => {
    const d = doc.current;
    const key = `${n}:${w}`;
    if (!d || n < 1 || n > d.numPages || drawing.current.has(key)) return;
    if ((imagesRef.current[n]?.w ?? 0) >= w) return;
    drawing.current.add(key);
    try {
      const page = await d.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: w / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      canvas.width = 0; // gives the memory back at once
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const before = imagesRef.current[n];
      if (before && before.w >= w) return URL.revokeObjectURL(url);
      if (before) URL.revokeObjectURL(before.url);
      imagesRef.current = { ...imagesRef.current, [n]: { url, w } };
      setImages(imagesRef.current);
    } catch {
      // The placeholder "Page n…" stays; the next turn tries again.
    } finally {
      drawing.current.delete(key);
    }
  }, []);
  useEffect(() => {
    if (!pages || !fit) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Phones refuse very large pictures (about 16 million dots), so stay under that.
    const most = Math.floor(Math.sqrt(14_000_000 / ratio));
    const size = (cssWidth: number) => Math.min(most, Math.max(800, Math.ceil((cssWidth * dpr) / 400) * 400));
    const pageWidth = fit / cols;
    for (const s of [here, here + 1, here - 1, here + 2])
      for (const p of spreads[s] ?? []) if (p) void draw(p, size(pageWidth * (s === here ? settled : 1)));
  }, [here, spreads, draw, pages, fit, cols, settled, ratio]);
  useEffect(() => () => Object.values(imagesRef.current).forEach((p) => URL.revokeObjectURL(p.url)), []);

  // ---- Turning ------------------------------------------------------------
  const go = useCallback(
    (forward: boolean) => {
      if (turn) return;
      const to = here + (forward ? 1 : -1);
      if (to < 0 || to > last) return;
      if (zoomRef.current > 1) zoomTo(1); // the next page starts whole
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setAt(to);
      setTurn({ to, forward, go: false });
      requestAnimationFrame(() => requestAnimationFrame(() => setTurn({ to, forward, go: true })));
      window.setTimeout(() => {
        setAt(to);
        setTurn(null);
      }, TURN_MS);
    },
    [here, last, turn, zoomTo],
  );
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  }, [go]);

  // Keys: arrows follow the reading direction (in Arabic the left arrow goes
  // on); + and − zoom; 0 or Escape fit the page again. While zoomed, the
  // arrows move around the page as usual instead of turning it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") zoomTo(zoomRef.current + 0.5, towardsPage());
      else if (e.key === "-" || e.key === "_") zoomTo(zoomRef.current - 0.5);
      else if (e.key === "0" || (e.key === "Escape" && zoomRef.current > 1 && !document.fullscreenElement)) zoomTo(1);
      else if (zoomRef.current > 1) return;
      else if (e.key === "ArrowRight") go(!rtl);
      else if (e.key === "ArrowLeft") go(rtl);
      else if (e.key === "Home") setAt(0);
      else if (e.key === "End") setAt(last);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, rtl, last, zoomTo, towardsPage]);

  // Pinch (two fingers) and Ctrl + mouse wheel (also a laptop's touchpad pinch).
  const pinching = useRef(false);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    let start: { d: number; z: number } | null = null;
    const gap = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const down = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinching.current = true;
      start = { d: gap(e.touches) || 1, z: zoomRef.current };
      e.preventDefault();
    };
    const move = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo((start.z * gap(e.touches)) / start.d, mid(e.touches), true);
    };
    const up = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
      if (e.touches.length === 0) window.setTimeout(() => (pinching.current = false), 0);
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY / 300), { x: e.clientX, y: e.clientY }, true);
    };
    v.addEventListener("touchstart", down, { passive: false });
    v.addEventListener("touchmove", move, { passive: false });
    v.addEventListener("touchend", up);
    v.addEventListener("touchcancel", up);
    v.addEventListener("wheel", wheel, { passive: false });
    return () => {
      v.removeEventListener("touchstart", down);
      v.removeEventListener("touchmove", move);
      v.removeEventListener("touchend", up);
      v.removeEventListener("touchcancel", up);
      v.removeEventListener("wheel", wheel);
    };
  }, [zoomTo, problem]);

  // One finger or the mouse: a tap turns (or a double-tap zooms), a swipe
  // turns, and while zoomed a mouse drag moves around the page.
  const press = useRef<{ x: number; y: number; left: number; top: number; mouse: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<number | null>(null);
  useEffect(() => () => void (tapTimer.current && window.clearTimeout(tapTimer.current)), []);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) {
      pinching.current = true;
      return;
    }
    const v = view.current;
    pinching.current = false;
    press.current = { x: e.clientX, y: e.clientY, left: v?.scrollLeft ?? 0, top: v?.scrollTop ?? 0, mouse: e.pointerType === "mouse" };
    if (press.current.mouse && zoomRef.current > 1) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    const v = view.current;
    if (!p || !v || !p.mouse || zoomRef.current <= 1 || !(e.buttons & 1)) return;
    v.scrollLeft = p.left - (e.clientX - p.x);
    v.scrollTop = p.top - (e.clientY - p.y);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || !e.isPrimary || pinching.current) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.hypot(dx, dy) < 10) return tap(e.clientX, e.clientY);
    if (zoomRef.current === 1 && Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) go(rtl ? dx > 0 : dx < 0);
  };
  const tap = (x: number, y: number) => {
    const now = Date.now();
    const before = lastTap.current;
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    tapTimer.current = null;
    if (before && now - before.t < TAP_MS && Math.hypot(x - before.x, y - before.y) < 40) {
      lastTap.current = null;
      zoomTo(zoomRef.current > 1 ? 1 : 2.5, { x, y });
      return;
    }
    lastTap.current = { t: now, x, y };
    if (zoomRef.current > 1 || !view.current) return;
    const box = view.current.getBoundingClientRect();
    const leftHalf = x < box.left + box.width / 2;
    // Wait a moment: a second tap means "zoom here", not "turn".
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = null;
      goRef.current(leftHalf ? rtl : !rtl);
    }, TAP_MS);
  };

  // On a PC, once the book opens, bring it up under the top bar so it fills the screen.
  const shown = useRef(false);
  useEffect(() => {
    if (!pages || shown.current || !wide) return;
    shown.current = true;
    frame.current?.scrollIntoView({ block: "start" });
  }, [pages, wide]);

  /** One page or two side by side (PC): keep the page being read in view. */
  const switchPages = () => {
    const first = (spreads[here] ?? []).find((p): p is number => p !== null) ?? 1;
    zoomTo(1);
    setOnePage((one) => {
      setAt(one ? Math.floor(first / 2) : first - 1);
      return !one;
    });
  };

  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  // ---- What is on screen --------------------------------------------------
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
          <img src={images[n].url} alt={`Page ${n} of ${pages}`} className="h-full w-full object-contain" draggable={false} />
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

  const zoomed = zoom > 1;
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
  const zoomBar = (
    <div role="group" aria-label="Zoom" className="flex items-center gap-1" data-testid="zoom-bar">
      <button type="button" onClick={() => zoomTo(zoom - 0.5, towardsPage())} disabled={zoom <= MIN_ZOOM} className={buttonClass("outline", "md", "w-11 px-0")} aria-label="Zoom out">
        <ZoomOut aria-hidden size={20} className="shrink-0" />
      </button>
      <span className={cx("w-14 text-center text-[15px] font-semibold tabular-nums", full && "text-white")} data-testid="zoom-level" aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" onClick={() => zoomTo(zoom + 0.5, towardsPage())} disabled={zoom >= MAX_ZOOM} className={buttonClass("outline", "md", "w-11 px-0")} aria-label="Zoom in">
        <ZoomIn aria-hidden size={20} className="shrink-0" />
      </button>
      <button type="button" onClick={() => zoomTo(1)} disabled={!zoomed} className={buttonClass("ghost", "md", full ? "text-white!" : undefined)}>
        Fit page
      </button>
      {fill && widthZoom > 1.02 && (
        <button
          type="button"
          onClick={() => {
            zoomTo(widthZoom, undefined, "exact");
            scrollTo.current = { x: 0, y: 0 };
          }}
          disabled={Math.abs(zoom - widthZoom) < 0.01}
          className={buttonClass("ghost", "md", full ? "text-white!" : undefined)}
          data-testid="fit-width"
        >
          <MoveHorizontal aria-hidden size={18} />
          Fit width
        </button>
      )}
    </div>
  );
  const ghost = buttonClass("ghost", "md", full ? "text-white!" : undefined);
  const height = fill ? area.h : fit > 0 ? (fit * ratio) / cols : undefined;

  return (
    <section
      ref={frame}
      aria-label={title}
      data-testid="flip-book"
      data-dir={dir}
      data-pages={pages}
      className={cx("flex scroll-mt-20 flex-col gap-3", full && "h-full overflow-auto bg-icci-green-900 p-2 sm:p-4")}
    >
      {/* The buttons, in one bar above the book (it wraps on a narrow screen). */}
      <div ref={bar} className={cx("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", full && "text-white")} data-testid="flip-bar">
        <div className="flex items-center gap-2">
          {rtl ? onButton : backButton}
          <p className="min-w-28 text-center text-[15px] font-semibold" aria-live="polite" data-testid="flip-page-line">
            {pageLine}
          </p>
          {rtl ? backButton : onButton}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {zoomBar}
          {wide && (
            <button type="button" onClick={switchPages} className={ghost} data-testid="pages-switch">
              {onePage ? <BookOpen aria-hidden size={18} /> : <FileText aria-hidden size={18} />}
              {onePage ? "Two pages" : "One page"}
            </button>
          )}
          <button type="button" className={ghost} onClick={() => (document.fullscreenElement ? document.exitFullscreen() : frame.current?.requestFullscreen())}>
            {full ? <Minimize2 aria-hidden size={18} /> : <Maximize2 aria-hidden size={18} />}
            {full ? "Leave full screen" : "Full screen"}
          </button>
          <a href={src} download={downloadName} className={ghost}>
            <Download aria-hidden size={18} />
            Open the PDF
          </a>
        </div>
      </div>

      {problem ? (
        <p role="alert" className="rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3">
          {problem}
        </p>
      ) : (
        <div ref={outer} className="relative w-full select-none rounded-2xl bg-gradient-to-b from-icci-green-dark to-icci-green-900 p-1.5 shadow-raised sm:p-2">
          <div
            ref={view}
            data-testid="flip-viewport"
            data-zoom={Math.round(zoom * 100) / 100}
            className={cx("relative rounded-md", zoomed ? "cursor-grab overflow-auto overscroll-contain active:cursor-grabbing" : "overflow-hidden")}
            style={{ height, touchAction: zoomed ? "pan-x pan-y" : "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (press.current = null)}
          >
            {/* Centred while it fits; once zoomed past the room, it scrolls from its own edge. */}
            <div className="flex min-h-full w-max min-w-full">
              <div
                className="relative m-auto grid [perspective:2200px]"
                style={{ gridTemplateColumns: double ? "1fr 1fr" : "1fr", width: fit * zoom, height: (fit * zoom * ratio) / cols }}
              >
                {pages === 0 ? (
                  <div className="col-span-full flex items-center justify-center text-white/80" role="status">
                    Opening the book…
                  </div>
                ) : (
                  <>
                    {page(under[0], double ? "left" : "single")}
                    {double && page(under[1], "right")}
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
                        <div className="absolute inset-0 [backface-visibility:hidden]">{page(leafFront, double ? (leafRight ? "right" : "left") : "single")}</div>
                        {double && (
                          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">{page(leafBack, leafRight ? "left" : "right")}</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className={cx("text-center text-sm text-icci-ink-60", full && "hidden")}>
        {zoomed ? "Drag to move around the page. “Fit page” shows the whole page again." : "To read small print: pinch, double-tap the spot, or use the + button."}
      </p>
    </section>
  );
}
