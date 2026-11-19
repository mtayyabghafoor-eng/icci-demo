// The round ICCI logo (public/brand/, cut out by scripts/make-brand-assets.mjs).
// Never recoloured or cropped. It may sit on dark green, cream or white.
import Image from "next/image";

export function Logo({ size = 56, priority = false }: { size?: number; priority?: boolean }) {
  const src = size > 160 ? "/brand/icci-logo-512.png" : size > 64 ? "/brand/icci-logo-160.png" : "/brand/icci-logo-64.png";
  return (
    <Image
      src={src}
      alt="Islamic Cultural Centre of Ireland logo"
      width={size}
      height={size}
      priority={priority}
      className="shrink-0 rounded-full drop-shadow-[0_2px_6px_rgb(0_0_0_/_0.25)]"
    />
  );
}
