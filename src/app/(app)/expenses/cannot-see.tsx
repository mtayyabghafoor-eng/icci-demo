// The short note the Library Operator sees on the expense screens. The
// database refuses them anyway; this just says so plainly.
import { PageHeader } from "@/components/ui";

export function CannotSeeExpenses({ title }: { title?: string }) {
  return (
    <>
      {title && <PageHeader title={title} />}
      <p className="rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3" data-testid="cannot-see-expenses">
        Your account cannot see expenses. Only a Super Admin, Centre Admin or Finance can.
      </p>
    </>
  );
}
