// The category drop-down's choices (slice P1.17): one group per main
// category, its sub-categories inside. Items go in a sub-category only, so a
// main category is offered only where it means "everything inside it" (the
// item list filter). Used by server and client forms alike (no state here).
import type { CategoryGroup } from "@/lib/categories/rules";

export function CategoryOptions({ groups, withMain = false }: { groups: CategoryGroup[]; withMain?: boolean }) {
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.main.id} label={g.main.name}>
          {withMain && <option value={g.main.id}>All of {g.main.name}</option>}
          {g.subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.active ? "" : " (switched off)"}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
