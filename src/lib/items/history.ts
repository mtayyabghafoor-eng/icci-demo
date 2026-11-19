// Turns the database's record of changes into plain sentences for the
// item's history list.
import { CONDITION_STATUS, formatDate, formatEuro, type Condition } from "./rules";

export type HistoryRow = {
  id: number;
  action: "insert" | "update";
  changed_at: string;
  changed_by_name: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown>;
};

export type Lookups = { categories: Map<string, string>; locations: Map<string, string> };

const FIELDS: [key: string, label: string][] = [
  ["name", "Name"],
  ["category_id", "Category"],
  ["location_id", "Location"],
  ["condition", "Condition"],
  ["value_cents", "Value"],
  ["purchase_date", "Purchase date"],
  ["warranty_end", "Warranty end"],
  ["unit", "Unit"],
  ["minimum_level", "Minimum level"],
  ["notes", "Notes"],
];

function show(key: string, value: unknown, lookups: Lookups): string {
  if (value === null || value === undefined || value === "") return "nothing";
  switch (key) {
    case "category_id":
      return lookups.categories.get(String(value)) ?? "an old category";
    case "location_id":
      return lookups.locations.get(String(value)) ?? "an old location";
    case "condition":
      return CONDITION_STATUS[value as Condition]?.word ?? String(value);
    case "value_cents":
      return formatEuro(Number(value));
    case "purchase_date":
    case "warranty_end":
      return formatDate(String(value));
    default:
      return String(value);
  }
}

export type HistoryLine = { id: number; when: string; who: string; title: string; changes: string[] };

export function describeHistory(rows: HistoryRow[], lookups: Lookups): HistoryLine[] {
  return rows.map((row) => {
    if (row.action === "insert") {
      return {
        id: row.id,
        when: row.changed_at,
        who: row.changed_by_name,
        title: "Registered",
        changes: [`Label ${String(row.new_values.label_serial)}`],
      };
    }
    const changes: string[] = [];
    for (const [key, label] of FIELDS) {
      const before = row.old_values?.[key] ?? null;
      const after = row.new_values[key] ?? null;
      if (before !== after) changes.push(`${label}: ${show(key, before, lookups)} → ${show(key, after, lookups)}`);
    }
    if ((row.old_values?.photo_path ?? null) !== (row.new_values.photo_path ?? null)) {
      changes.push(row.old_values?.photo_path ? "Photo replaced (the old photo is kept)" : "Photo added");
    }
    // Location and condition change only through Move / Report (slice 6).
    const only = (prefix: string) => changes.length === 1 && changes[0].startsWith(prefix);
    return {
      id: row.id,
      when: row.changed_at,
      who: row.changed_by_name,
      title: only("Location:") ? "Moved" : only("Condition:") ? "Condition changed" : "Details changed",
      changes: changes.length ? changes : ["Saved with no changes"],
    };
  });
}
