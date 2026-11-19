// Plain rules for fixed-asset events (move, damage, missing, found or
// repaired, disposal), kept free of the database and the browser so they
// can be unit-tested. The database enforces the same rules itself
// (migration 0008); these only decide what the screens offer and say.
import { CONDITION_STATUS, type Condition, type Tone } from "@/lib/items/rules";

export type AssetEventKind = "move" | "damage" | "missing" | "back_in_use" | "disposal";

/** The actions on an asset's page. "found" and "repaired" are both "back in use". */
export type AssetAction = "move" | "damage" | "missing" | "repaired" | "found" | "dispose";

export const ASSET_ACTIONS: Record<AssetAction, { kind: AssetEventKind; button: string; title: string; done: string }> = {
  move: { kind: "move", button: "Move", title: "Move this asset", done: "Asset moved." },
  damage: { kind: "damage", button: "Report damage", title: "Report damage", done: "Damage reported." },
  missing: { kind: "missing", button: "Mark missing", title: "Mark missing", done: "Marked missing." },
  repaired: { kind: "back_in_use", button: "Mark repaired", title: "Mark repaired", done: "Marked repaired." },
  found: { kind: "back_in_use", button: "Mark found", title: "Mark found", done: "Marked found." },
  dispose: {
    kind: "disposal",
    button: "Dispose",
    title: "Dispose of this asset",
    done: "Disposal sent. It happens only once a different admin approves it.",
  },
};

export function isAssetAction(value: string): value is AssetAction {
  return Object.hasOwn(ASSET_ACTIONS, value);
}

/** Which buttons an asset shows, in order. */
export function actionsFor(condition: Condition | null, disposalPending: boolean): AssetAction[] {
  if (disposalPending || condition === "disposed" || condition == null) return [];
  if (condition === "missing") return ["found", "damage", "dispose"];
  if (condition === "damaged") return ["move", "repaired", "missing", "dispose"];
  return ["move", "damage", "missing", "dispose"];
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
type FormValues = {
  kind: AssetEventKind;
  note: string;
  /** Either a person from the directory or a typed name (never both). */
  reported_by?: string;
  reported_by_person_id?: string;
  to_location_id?: string;
  to_condition?: "good" | "fair";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(raw: string, max: number, missing: string, tooLong: string): Parsed<string> {
  const value = raw.trim();
  if (!value) return { ok: false, error: missing };
  if (value.length > max) return { ok: false, error: tooLong };
  return { ok: true, value };
}

/** Checks what was typed into an asset form. Only the fields that action uses are sent. */
export function parseAssetForm(
  get: (name: string) => string,
  action: AssetAction,
): { ok: true; values: FormValues } | { ok: false; error: string } {
  const note = text(get("note"), 2000, "Write a note saying what happened.", "The note is too long (2,000 characters at most).");
  if (!note.ok) return note;
  // "Reported by": a person picked from the list, or "Someone else" with a
  // typed name. (No pick but a typed name also counts as a typed name.)
  const picked = get("reported_by_person_id").trim();
  const values: FormValues = { kind: ASSET_ACTIONS[action].kind, note: note.value };
  if (picked && picked !== "other") {
    if (!UUID.test(picked)) return { ok: false, error: "Pick a person from the list, or choose 'Someone else'." };
    values.reported_by_person_id = picked;
  } else {
    const missing = picked === "other" ? "Type the name of who reported it." : "Say who reported it.";
    const who = text(get("reported_by"), 200, missing, "The name is too long (200 characters at most).");
    if (!who.ok) return who;
    values.reported_by = who.value;
  }

  if (action === "move") {
    const to = get("to_location_id").trim();
    if (!to) return { ok: false, error: "Pick where it is going." };
    if (!UUID.test(to)) return { ok: false, error: "Pick a place from the list." };
    values.to_location_id = to;
  }
  if (action === "found" || action === "repaired") {
    const c = get("to_condition");
    if (c !== "good" && c !== "fair") return { ok: false, error: "Choose Good or Fair." };
    values.to_condition = c;
  }
  return { ok: true, values };
}

export type AssetEventRow = {
  id: number;
  item_id: string;
  kind: AssetEventKind;
  status: "recorded" | "pending" | "approved" | "rejected";
  from_location_id: string | null;
  to_location_id: string | null;
  from_condition: Condition | null;
  to_condition: Condition | null;
  note: string;
  reported_by: string | null;
  reported_by_person_id: string | null;
  photo_path: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_by: string | null;
  created_at: string;
};

export const ASSET_EVENT_COLUMNS =
  "id, item_id, kind, status, from_location_id, to_location_id, from_condition, to_condition, note, reported_by, reported_by_person_id, photo_path, decided_by, decided_at, decision_note, created_by, created_at";

const word = (c: Condition | null) => (c ? CONDITION_STATUS[c].word : "unknown");

/** One line saying what happened, e.g. "Moved: Room A1 → Room B1". */
export function describeEvent(e: AssetEventRow, locationName: Map<string, string>): string {
  const place = (id: string | null) => (id ? (locationName.get(id) ?? "an old location") : "unknown");
  switch (e.kind) {
    case "move":
      return `Moved: ${place(e.from_location_id)} → ${place(e.to_location_id)}`;
    case "damage":
      return `Reported damaged (was ${word(e.from_condition)})`;
    case "missing":
      return `Marked missing (was ${word(e.from_condition)})`;
    case "back_in_use":
      return `${e.from_condition === "missing" ? "Marked found" : "Marked repaired"} (now ${word(e.to_condition)})`;
    case "disposal":
      return `Disposal (was ${word(e.from_condition)})`;
  }
}

export const DISPOSAL_STATUS: Record<string, { word: string; tone: Tone }> = {
  pending: { word: "Waiting for approval", tone: "amber" },
  approved: { word: "Approved", tone: "green" },
  rejected: { word: "Rejected", tone: "red" },
};

/** Turns a database refusal into a sentence for the screen. */
export function friendlyAssetError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/asset_events_one_pending_per_item/i.test(message)) {
    return "A disposal of this asset is already waiting for approval.";
  }
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  // The database's own rules are written as plain sentences.
  if (/^[A-Z][^\n]{5,200}\.$/.test(message.trim())) return message.trim();
  return "Something went wrong. Please try again.";
}

/** Who reported an entry: a person (with a link to their page) or a typed name. */
export function reporterOf(e: Pick<AssetEventRow, "reported_by" | "reported_by_person_id">, personName: Map<string, string>) {
  if (e.reported_by_person_id) {
    return { name: personName.get(e.reported_by_person_id) ?? "A person in the directory", personId: e.reported_by_person_id };
  }
  return { name: e.reported_by ?? "Not recorded", personId: null as string | null };
}
