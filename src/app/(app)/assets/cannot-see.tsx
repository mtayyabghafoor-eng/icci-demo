// The short note Finance and the Library Operator see on the asset lists.
// The database refuses them anyway; this just says so plainly.
export function CannotSeeAssets() {
  return (
    <p className="mt-4 rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3" data-testid="cannot-see-assets">
      Your account cannot see assets. Only a Super Admin or Centre Admin can.
    </p>
  );
}
