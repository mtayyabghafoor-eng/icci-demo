// The short note Finance sees on the library screens (slice P4.2).
// The database refuses it anyway; this just says so plainly.
export function CannotSeeLibrary() {
  return (
    <p className="mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3" data-testid="cannot-see-library">
      Your account cannot see the library. Only a Super Admin, Centre Admin or the Library Operator can.
    </p>
  );
}
