// Checks what an admin typed into the register and edit forms, and turns it
// into database values. The database checks the same rules again.
import { parseEuro, parseLabelNumber, type ItemKind } from "./rules";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(get: Get, name: string, max = 200): string {
  return get(name).trim().slice(0, max);
}

function stockFields(get: Get): Result<{ unit: string; minimum_level: number }> {
  const unit = text(get, "unit", 40);
  if (!unit) return { ok: false, error: "Enter the unit it is counted in, for example box, roll or bottle." };
  const min = get("minimum_level").trim();
  if (!/^\d{1,6}$/.test(min)) return { ok: false, error: "Enter the minimum level as a whole number (0 or more)." };
  return { ok: true, values: { unit, minimum_level: Number(min) } };
}

export type RegisterValues = {
  label_serial: string;
  kind: ItemKind;
  name: string;
  category_id: string;
  location_id: string;
  condition: "good" | null;
  unit: string | null;
  minimum_level: number | null;
};

export function parseRegister(get: Get): Result<RegisterValues> {
  const label = parseLabelNumber(get("label"));
  if (!label) return { ok: false, error: "Enter the label number, for example ICCI-000123." };
  const kind = get("kind");
  if (kind !== "fixed_asset" && kind !== "consumable") return { ok: false, error: "Choose what kind of item this is." };
  const name = text(get, "name");
  if (!name) return { ok: false, error: "Enter a name for the item." };
  const category_id = get("category_id");
  if (!UUID.test(category_id)) return { ok: false, error: "Choose a category." };
  const location_id = get("location_id");
  if (!UUID.test(location_id)) return { ok: false, error: "Choose where the item is." };

  if (kind === "fixed_asset") {
    return {
      ok: true,
      values: { label_serial: label, kind, name, category_id, location_id, condition: "good", unit: null, minimum_level: null },
    };
  }
  const stock = stockFields(get);
  if (!stock.ok) return stock;
  return { ok: true, values: { label_serial: label, kind, name, category_id, location_id, condition: null, ...stock.values } };
}

export type EditValues = {
  name: string;
  category_id: string;
  notes: string | null;
  value_cents?: number | null;
  purchase_date?: string | null;
  warranty_end?: string | null;
  unit?: string;
  minimum_level?: number;
};

export function parseEdit(get: Get, kind: ItemKind): Result<EditValues> {
  const name = text(get, "name");
  if (!name) return { ok: false, error: "Enter a name for the item." };
  const category_id = get("category_id");
  if (!UUID.test(category_id)) return { ok: false, error: "Choose a category." };
  const notes = text(get, "notes", 2000) || null;

  if (kind === "consumable") {
    const stock = stockFields(get);
    if (!stock.ok) return stock;
    return { ok: true, values: { name, category_id, notes, ...stock.values } };
  }

  const value_cents = parseEuro(get("value"));
  if (value_cents === undefined) return { ok: false, error: "Enter the value in euros, for example 125.50, or leave it empty." };
  const purchase_date = get("purchase_date").trim() || null;
  const warranty_end = get("warranty_end").trim() || null;
  for (const d of [purchase_date, warranty_end]) {
    if (d && (!DATE.test(d) || Number.isNaN(Date.parse(d)))) return { ok: false, error: "A date is not valid." };
  }
  if (purchase_date && warranty_end && warranty_end < purchase_date) {
    return { ok: false, error: "The warranty cannot end before the purchase date." };
  }
  return { ok: true, values: { name, category_id, notes, value_cents, purchase_date, warranty_end } };
}

/** Plain-English messages for the database's refusals. */
export function friendlyDbError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/already on another item/i.test(message)) return "This label is already on another item.";
  if (/items_label_serial_fkey|labels/i.test(message) && /foreign key/i.test(message)) {
    return "That label number is not on the list of printed labels.";
  }
  if (/items_consumable_unique_per_place/i.test(message)) {
    return "There is already a consumable with that name in that place.";
  }
  if (/store room or on a shelf|switched off|cannot be/i.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  return "That could not be saved. Please check the details and try again.";
}
