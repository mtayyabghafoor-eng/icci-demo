// Makes the web versions of the logo and the Centre photographs.
// Sources live in docs/brand/ (supplied by the owner); results go to
// public/brand/ and are committed, so this only needs running again if a
// source changes. Run: node scripts/make-brand-assets.mjs
//
// Uses "sharp", the image tool that Next.js already installs for its own
// image handling. Nothing new is added to package.json.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = "docs/brand";
const OUT = "public/brand";
await mkdir(OUT, { recursive: true });

// ---- Logo: cut the round coin out of its white square ----------------------
// Measured from the 2,000 px source: the coin spans x 1..1998 and y 0..1989.
// The mask sits 3 px inside that edge so no white fringe shows on dark green.
const LOGO = `${SRC}/icci-logo-2000.jpg`;
const cx = 999.5;
const cy = 995;
const r = 993;
const size = 2000;
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
     <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>
   </svg>`,
);
// Two steps: sharp crops before it composites, so mask first, then crop.
const masked = await sharp(LOGO)
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();
const coin = await sharp(masked)
  .extract({ left: Math.round(cx - r), top: Math.round(cy - r), width: r * 2, height: r * 2 })
  .png()
  .toBuffer();

// E5: only the PNGs are used (the screens, the room labels and the guide);
// the WebP copies were never shown, so they are no longer made.
for (const px of [512, 160, 64]) {
  await sharp(coin).resize(px, px, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(`${OUT}/icci-logo-${px}.png`);
}

// ---- E6: icons for the browser tab and a phone's home screen ------------
// The whole coin, never cropped. The tab icon keeps the clear background;
// the home-screen icons sit the coin on dark green (#004236), because
// phones fill a clear background with black or white.
const GREEN = { r: 0, g: 66, b: 54, alpha: 1 };
async function onGreen(px, file) {
  const inner = Math.round(px * 0.84);
  const coinPng = await sharp(coin).resize(inner, inner, { kernel: "lanczos3" }).png().toBuffer();
  await sharp({ create: { width: px, height: px, channels: 4, background: GREEN } })
    .composite([{ input: coinPng, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(file);
}
await sharp(coin).resize(48, 48, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile("src/app/icon.png");
await onGreen(180, "src/app/apple-icon.png");
await onGreen(192, `${OUT}/app-icon-192.png`);
await onGreen(512, `${OUT}/app-icon-512.png`);

// ---- Photographs: gentle clean-up -------------------------------------------
// No larger originals exist, so: upscale with a high-quality filter, lift
// contrast and colour a little, sharpen lightly. The screens then lay a dark
// green wash over them, which also hides the softness.
async function enhance(file, name, { width, crop }) {
  let img = sharp(`${SRC}/${file}`);
  if (crop) img = img.extract(crop);
  img = img
    .resize({ width, kernel: "lanczos3" })
    .modulate({ saturation: 1.08, brightness: 1.02 })
    .linear(1.06, -6) // a touch more contrast
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 1.2 });
  // E5: one size only; Next.js makes the smaller sizes a screen needs.
  await img.clone().webp({ quality: 82 }).toFile(`${OUT}/${name}-${width}.webp`);
}

// Straight-on view of the dome and minaret: sign-in panel and home strip.
// (E5: the flowers view was never used on a screen, so it is no longer made.)
await enhance("photo-front.webp", "centre-front", { width: 1800 });

console.log("Brand assets written to", OUT);
