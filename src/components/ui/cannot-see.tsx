// Round C1: the one short note an account sees on a screen its role cannot
// use (it replaces nine copies, one per area). The database refuses them
// anyway; this just says so plainly. The test ids stay as they were.
import { PageHeader } from "./layout";

const AREAS = {
  assets: "Your account cannot see assets. Only a Super Admin or Centre Admin can.",
  expenses: "Your account cannot see expenses. Only a Super Admin, Centre Admin or Finance can.",
  library: "Your account cannot see the library. Only a Super Admin, Centre Admin or the Library Operator can.",
  people: "Your account cannot see the people directory. Only a Super Admin or Centre Admin can.",
  policies: "Your account cannot see policies. Only a Super Admin or Centre Admin can.",
  renewals: "Your account cannot see the renewals register. Only a Super Admin or Centre Admin can.",
  rota: "Your account cannot see the rota. Only a Super Admin or Centre Admin can.",
  tickets: "Your account cannot see maintenance tickets. Only a Super Admin or Centre Admin can.",
  vehicles: "Your account cannot see vehicles. Only a Super Admin or Centre Admin can.",
  // Round C5.
  accounts: "Your account cannot manage accounts. Only a Super Admin can.",
  "audit-log": "Your account cannot see the audit log. Only a Super Admin can.",
} as const;

export type CannotSeeArea = keyof typeof AREAS;

export function CannotSee({ area, title }: { area: CannotSeeArea; title?: string }) {
  return (
    <>
      {title && <PageHeader title={title} />}
      <p
        className={`${title ? "" : "mt-4 "}rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3`}
        data-testid={`cannot-see-${area}`}
      >
        {AREAS[area]}
      </p>
    </>
  );
}
