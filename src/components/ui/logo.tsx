// The round ICCI logo (public/brand/, cut out by scripts/make-brand-assets.mjs).
// Never recoloured or cropped. It may sit on dark green, cream or white.
// E5: loaded the ordinary way (only the Centre photo loads early), so a copy
// hidden on this screen size (the PC menu logo on a phone) is never fetched.
import Image from "next/image";

export function Logo({ size = 56 }: { size?: number }) {
  const src = size > 160 ? "/brand/icci-logo-512.png" : size > 64 ? "/brand/icci-logo-160.png" : "/brand/icci-logo-64.png";
  return (
    <Image
      src={src}
      alt="Islamic Cultural Centre of Ireland logo"
      width={size}
      height={size}
      className="shrink-0 rounded-full drop-shadow-[0_2px_6px_rgb(0_0_0_/_0.25)]"
    />
  );
}
