// The short note Finance and the Library Operator see on the people screens.
// The database refuses them anyway; this just says so plainly.
export function CannotSeePeople() {
  return (
    <p className="mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3" data-testid="cannot-see-people">
      Your account cannot see the people directory. Only a Super Admin or Centre Admin can.
    </p>
  );
}
