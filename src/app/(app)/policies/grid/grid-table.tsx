// The policy grid itself (slice P2.6): people down the side, policies across
// the top, a coloured word in each square (never colour alone). "–" means the
// policy does not apply to that person's role. Used by the grid page and its
// print view.
// A7: an amber or red square opens Record sign-off with that person ticked
// (and comes back here); names and policy titles stay in view while scrolling.
import Link from "next/link";
import { formatDate } from "@/lib/items/rules";
import { arrangeGrid, SIGNOFF_STATUS, type Square } from "@/lib/policies/signoffs";
import { StatusBadge } from "@/components/ui";

/** A7: the header row stays at the top of the scrolling grid. */
const STICKY_TOP = "sticky top-0 bg-[var(--icci-green-50)]";

export function GridTable({
  squares,
  roleName,
  sectionName,
  print = false,
  gridQuery = "",
}: {
  squares: Square[];
  roleName: Map<string, string>;
  sectionName: Map<string, string>;
  print?: boolean;
  /** The grid's own filter, kept through a sign-off so Save comes back to it. */
  gridQuery?: string;
}) {
  const { policies, people } = arrangeGrid(squares);
  if (people.length === 0) return <p className="mt-4">Nothing to show. No published policy applies to anyone in this selection.</p>;
  return (
    <div className={print ? "mt-3" : "list-table-wrap max-h-[75vh] overflow-auto"} data-testid={print ? undefined : "policy-grid-scroll"}>
      <table className={print ? "policy-grid-print w-full border-collapse text-[11px]" : "list-table"} data-testid="policy-grid">
        <thead>
          <tr>
            <th className={print ? "px-3 py-2 text-left" : `${STICKY_TOP} left-0 z-20 px-3 py-2 text-left`}>Person</th>
            {policies.map((p) => (
              <th key={p.id} className={print ? "px-3 py-2 text-left" : `${STICKY_TOP} z-10 px-3 py-2 text-left`} dir="auto">
                {print ? (
                  p.title
                ) : (
                  <Link href={`/policies/${p.id}`} className="inline-flex min-h-11 items-center font-semibold">
                    {p.title}
                  </Link>
                )}
                <span className="block font-normal">{p.version_label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} data-testid="grid-person" className="border-b border-icci-panel align-top">
              <td className={print ? "px-3 py-2" : "sticky left-0 z-[5] bg-white px-3 py-2 shadow-[1px_0_0_var(--icci-line)]"} dir="auto">
                {print ? (
                  <span className="font-semibold">{person.full_name}</span>
                ) : (
                  <Link href={`/people/${person.id}`} className="font-semibold">
                    {person.full_name}
                  </Link>
                )}
                <span className="block text-sm">
                  {roleName.get(person.person_role_id)} · {sectionName.get(person.section_id)}
                </span>
              </td>
              {policies.map((p) => {
                const q = person.squares.get(p.id);
                return (
                  <td key={p.id} className="px-3 py-2 whitespace-nowrap" data-testid="grid-square">
                    {q ? (
                      <>
                        {!print && q.status !== "signed" ? (
                          <Link
                            href={`/policies/${p.id}/sign-off?person=${person.id}&grid=${encodeURIComponent(gridQuery)}`}
                            className="inline-flex min-h-9 items-center no-underline! hover:opacity-80"
                            aria-label={`Record ${person.full_name}'s sign-off of ${p.title}`}
                            data-testid="grid-square-link"
                          >
                            <StatusBadge {...SIGNOFF_STATUS[q.status]} />
                          </Link>
                        ) : (
                          <StatusBadge {...SIGNOFF_STATUS[q.status]} />
                        )}
                        {q.signed_on && <span className="mt-1 block text-[12px]">{formatDate(q.signed_on)}</span>}
                      </>
                    ) : (
                      <span aria-label="Does not apply">–</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
