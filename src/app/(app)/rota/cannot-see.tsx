// The short note Finance and the Library Operator see on the rota screens.
// The database refuses them anyway; this just says so plainly.
export function CannotSeeRota() {
  return (
    <p className="mt-4 rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3" data-testid="cannot-see-rota">
      Your account cannot see the rota. Only a Super Admin or Centre Admin can.
    </p>
  );
}
