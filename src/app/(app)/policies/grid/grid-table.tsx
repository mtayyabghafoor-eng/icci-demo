// The policy grid itself (slice P2.6): people down the side, policies across
// the top, a coloured word in each square (never colour alone). "–" means the
// policy does not apply to that person's role. Used by the grid page and its
// print view.
import Link from "next/link";
import { formatDate } from "@/lib/items/rules";
import { arrangeGrid, SIGNOFF_STATUS, type Square } from "@/lib/policies/signoffs";
import { StatusBadge } from "../../items/ui";

export function GridTable({
  squares,
  roleName,
  sectionName,
  print = false,
}: {
  squares: Square[];
  roleName: Map<string, string>;
  sectionName: Map<string, string>;
  print?: boolean;
}) {
  const { policies, people } = arrangeGrid(squares);
  if (people.length === 0) return <p className="mt-4">Nothing to show. No published policy applies to anyone in this selection.</p>;
  return (
    <div className={print ? "mt-3" : "list-table-wrap overflow-x-auto"}>
      <table className={print ? "policy-grid-print w-full border-collapse text-[11px]" : "list-table"} data-testid="policy-grid">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left">Person</th>
            {policies.map((p) => (
              <th key={p.id} className="px-3 py-2 text-left" dir="auto">
                {print ? (
                  p.title
                ) : (
                  <Link href={`/policies/${p.id}`} className="font-semibold">
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
              <td className="px-3 py-2" dir="auto">
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
                        <StatusBadge {...SIGNOFF_STATUS[q.status]} />
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
