// Plain rules for label sheets, kept free of the database and the screens so
// they can be tested on their own.
//
// The sheet is A4 with 21 labels, 3 across and 7 down, each 63.5 x 38.1 mm
// (Avery L7160 size, owner's decision). The QR code on each label holds only
// the web link with the label number: no other data.
import qrcode from "qrcode-generator";
import { labelPath, parseLabelNumber } from "@/lib/items/rules";

export const LABELS_PER_SHEET = 21;
export const MAX_LABELS_PER_PRINT = 210; // ten sheets
export const MAX_SKIP = LABELS_PER_SHEET - 1;

/** Sizes in millimetres, for the printed page. */
export const SHEET_MM = {
  pageWidth: 210,
  pageHeight: 297,
  top: 15.15,
  side: 7.2,
  labelWidth: 63.5,
  labelHeight: 38.1,
  columnGap: 2.5,
  columns: 3,
  rows: 7,
} as const;

export function serialOf(n: number): string {
  return `ICCI-${String(n).padStart(6, "0")}`;
}

/** "How many labels?" box: a whole number from 1 to 210. */
export function parsePrintCount(raw: string | null | undefined): { ok: true; value: number } | { ok: false; error: string } {
  const text = (raw ?? "").trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: "Enter how many labels to print, as a whole number." };
  const n = Number(text);
  if (n < 1 || n > MAX_LABELS_PER_PRINT) {
    return { ok: false, error: `Choose between 1 and ${MAX_LABELS_PER_PRINT} labels (${MAX_LABELS_PER_PRINT} is ten sheets).` };
  }
  return { ok: true, value: n };
}

/** "Skip the first __ spaces" box: 0 to 20. Anything else counts as 0. */
export function parseSkip(raw: string | string[] | null | undefined): number {
  const text = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  if (!/^\d{1,2}$/.test(text)) return 0;
  const n = Number(text);
  return n <= MAX_SKIP ? n : 0;
}

/** Every label number from first to last, e.g. ICCI-000301 … ICCI-000321. */
export function serialsInRange(first: number, last: number): string[] {
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first) return [];
  return Array.from({ length: last - first + 1 }, (_, i) => serialOf(first + i));
}

/** How many sheets of paper are needed. */
export function sheetsNeeded(count: number, skip = 0): number {
  return count < 1 ? 0 : Math.ceil((count + skip) / LABELS_PER_SHEET);
}

/**
 * Places the labels on sheets, left to right then top to bottom. The first
 * `skip` spaces of the first sheet stay empty (null) for a part-used sheet.
 * The last sheet is filled with empty spaces to 21.
 */
export function layoutSheets(serials: string[], skip = 0): (string | null)[][] {
  if (serials.length === 0) return [];
  const cells: (string | null)[] = [...Array<null>(skip).fill(null), ...serials];
  const sheets: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += LABELS_PER_SHEET) {
    const sheet = cells.slice(i, i + LABELS_PER_SHEET);
    while (sheet.length < LABELS_PER_SHEET) sheet.push(null);
    sheets.push(sheet);
  }
  return sheets;
}

/**
 * The full link in a label's QR code: the address the app is open on, plus
 * /l/ and the number. Refuses anything that is not a proper label number or
 * web address, so nothing else can end up inside a code.
 */
export function labelLink(origin: string, serial: string): string {
  const parsed = parseLabelNumber(serial);
  if (!parsed || parsed !== serial) throw new Error("Not a label number.");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Not a web address.");
  return `${url.origin}${labelPath(serial)}`;
}

/**
 * The QR code for a piece of text, as rows of dark (true) and light squares.
 * Medium error correction: still readable with a small scratch.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => qr.isDark(r, c)));
}

/** One SVG path drawing every dark square, offset by a quiet margin. */
export function qrSvgPath(matrix: boolean[][], margin: number): string {
  const parts: string[] = [];
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) parts.push(`M${c + margin} ${r + margin}h1v1h-1z`);
    }),
  );
  return parts.join("");
}

/**
 * Labels are marked "TEST LABEL" until the app runs on ICCI's permanent web
 * address (owner's decision: prototype labels are test labels only).
 */
export function labelsAreTest(environment: string | undefined): boolean {
  return environment !== "production";
}

/**
 * UI-9: the small tag printed on each label. Development keeps the red
 * "TEST LABEL"; the online demo (staging) shows a quiet grey "DEMO";
 * production prints none.
 */
export function labelTag(environment: string | undefined): "TEST LABEL" | "DEMO" | null {
  if (environment === "production") return null;
  return environment === "staging" ? "DEMO" : "TEST LABEL";
}

/** Database messages in plain words. */
export function friendlyLabelError(message: string): string {
  if (/between 1 and 210/i.test(message)) return `Choose between 1 and ${MAX_LABELS_PER_PRINT} labels (${MAX_LABELS_PER_PRINT} is ten sheets).`;
  if (/Only a Super Admin or Centre Admin|permission denied|row-level security/i.test(message)) {
    return "Your account cannot print labels. Only a Super Admin or Centre Admin can.";
  }
  if (/could not be found/i.test(message)) return "That label sheet could not be found.";
  if (/not enough label numbers/i.test(message)) return "There are not enough label numbers left. Ask a Super Admin.";
  return "The labels could not be created. Please try again.";
}
