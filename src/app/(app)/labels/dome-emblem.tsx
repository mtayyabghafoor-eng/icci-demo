// UI-9: a small black dome-and-crescent emblem for printed labels. It is a
// plain drawing of a domed building, not the ICCI logo (the logo is never
// recoloured, so it cannot be printed black). Pure black on white, so it
// prints crisply on any label printer.
export function DomeEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false" shapeRendering="geometricPrecision">
      {/* Crescent on a short spire. */}
      <circle cx="12" cy="2.6" r="1.7" fill="#000" />
      <circle cx="12.75" cy="2.15" r="1.35" fill="#fff" />
      <rect x="11.6" y="4.1" width="0.8" height="2.2" fill="#000" />
      {/* The dome. */}
      <path d="M4.6 14.6C4.6 9.9 7.9 6.9 12 6.3c4.1.6 7.4 3.6 7.4 8.3z" fill="#000" />
      {/* Drum and base with three arched windows. */}
      <rect x="3.6" y="14.6" width="16.8" height="1.6" fill="#000" />
      <path
        d="M2.4 16.9h19.2V22H2.4zM6.1 21.1v-1.9a1.15 1.15 0 0 1 2.3 0v1.9zm4.75 0v-1.9a1.15 1.15 0 0 1 2.3 0v1.9zm4.75 0v-1.9a1.15 1.15 0 0 1 2.3 0v1.9z"
        fill="#000"
        fillRule="evenodd"
      />
    </svg>
  );
}
