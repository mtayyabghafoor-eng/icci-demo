// Slice UI-8: every text colour in the new look is readable on the
// background it is used on. The standard (WCAG AA) asks for a contrast of
// at least 4.5 to 1 for normal text, and 3 to 1 for large titles (24 px and
// up) and for the outlines of controls. Values are the ones in
// src/app/globals.css; if a colour there changes, change it here too.
import { describe, expect, it } from "vitest";

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const C = {
  green900: "#002B23",
  green800: "#004236",
  green600: "#006B54",
  green100: "#EAF2EF",
  green50: "#F3F8F6",
  gold500: "#B8985A",
  gold100: "#F4EEDF",
  gold300: "#D9C9A3",
  focus: "#8A6A2B",
  cream: "#FAF8F3",
  white: "#FFFFFF",
  ink: "#1F2A27",
  ink60: "#5B6663",
  red: "#B3261E",
  okText: "#1B6B3A",
  okFill: "#E3F2E7",
  warnText: "#8A5A00",
  warnFill: "#FBF1DC",
  badText: "#B3261E",
  badFill: "#FBE7E5",
  noneText: "#4A5250",
  noneFill: "#EEF0EF",
  sidebarCaption: "#D9C9A3",
  sidebarSub: "#E9E1CF",
};

describe("normal text is readable (at least 4.5 to 1)", () => {
  it.each([
    ["body text on cream", C.ink, C.cream],
    ["body text on white", C.ink, C.white],
    ["grey help text on cream", C.ink60, C.cream],
    ["grey help text on white", C.ink60, C.white],
    ["grey help text on the pale green table header", C.ink60, C.green50],
    ["links on white", C.green600, C.white],
    ["links on cream", C.green600, C.cream],
    ["white on a primary button", C.white, C.green800],
    ["green status word", C.okText, C.okFill],
    ["amber status word", C.warnText, C.warnFill],
    ["red status word", C.badText, C.badFill],
    ["grey status word", C.noneText, C.noneFill],
    ["error text on white", C.red, C.white],
    ["sidebar words on dark green", C.white, C.green800],
    ["sidebar group captions on dark green", C.sidebarCaption, C.green800],
    ["sidebar subtitle on the darkest green", C.sidebarSub, C.green900],
    ["quick-action icon on its gold tint", C.green800, C.gold100],
  ])("%s", (_name, text, background) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("large titles and control outlines (at least 3 to 1)", () => {
  it.each([
    ["serif page titles on cream", C.green800, C.cream],
    ["deep gold focus ring on white", C.focus, C.white],
    ["deep gold focus ring on cream", C.focus, C.cream],
    ["deep gold focus ring on the pale green", C.focus, C.green50],
    ["light gold focus ring on the dark green sidebar", C.gold300, C.green800],
    ["light gold focus ring on the darkest green", C.gold300, C.green900],
  ])("%s", (_name, a, b) => {
    expect(contrast(a, b)).toBeGreaterThanOrEqual(3);
  });
});

describe("the rule in PLAN.md: gold is never used for small text", () => {
  it("gold on white is below the 4.5 to 1 needed for small text", () => {
    expect(contrast(C.gold500, C.white)).toBeLessThan(4.5);
  });
});

describe("the contrast calculation itself", () => {
  it("matches known values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
  });
});
