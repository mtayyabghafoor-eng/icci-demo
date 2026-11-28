// Phase 6 (PLAN.md 5.6; docs/PHASE-6.md): the three service registers,
// funerals, Shahada and Nikah, for the Super Admin only. What each holds,
// how a sent form is read, and the words the screens use. The database
// checks everything again (migration 0060); this only gives a kinder
// message first. Tested in tests/unit/registers-rules.test.ts.
import type { Get } from "@/lib/forms";
import { isDate } from "@/lib/vetting/rules";

export type Result<T> = { ok: true; values: T } | { ok: false; error: string };

/** Only the Super Admin sees the registers (PLAN.md 5.6). */
export const MAY_SEE_REGISTERS: readonly string[] = ["super_admin"];

export const REGISTER_KINDS = ["funerals", "shahada", "nikah"] as const;
export type RegisterKind = (typeof REGISTER_KINDS)[number];

export const isRegisterKind = (v: unknown): v is RegisterKind => typeof v === "string" && (REGISTER_KINDS as readonly string[]).includes(v);

type Config = {
  /** Menu and page title. */
  title: string;
  /** "a funeral", for sentences. */
  one: string;
  table: "funeral_entries" | "shahada_entries" | "nikah_entries";
  view: "funeral_register" | "shahada_register" | "nikah_register";
  /** The columns a name search looks in. */
  searchIn: string[];
  /** One line under the title. */
  intro: string;
  /** What is never kept, said under each list and form. */
  never: string;
  addLabel: string;
  dateLabel: string;
};

export const REGISTER: Record<RegisterKind, Config> = {
  funerals: {
    title: "Funeral register",
    one: "funeral",
    table: "funeral_entries",
    view: "funeral_register",
    searchIn: ["deceased_name", "family_contact_name", "number"],
    intro: "Funerals the Centre helped with: who died, the family contact, the services given and who was on duty.",
    never: "Never record the cause of death, medical details, age, address or identity documents.",
    addLabel: "Record a funeral",
    dateLabel: "Date of the janazah",
  },
  shahada: {
    title: "Shahada register",
    one: "Shahada",
    table: "shahada_entries",
    view: "shahada_register",
    searchIn: ["person_name", "number"],
    intro: "Shahadas taken at the Centre, each with its certificate number and the authenticating imam.",
    never: "Only for people aged 18 or over. Never record a former name, contact details, nationality or identity documents.",
    addLabel: "Record a Shahada",
    dateLabel: "Date of the Shahada",
  },
  nikah: {
    title: "Nikah register",
    one: "Nikah",
    table: "nikah_entries",
    view: "nikah_register",
    searchIn: ["spouse_1_name", "spouse_2_name", "number"],
    intro: "Nikahs held at the Centre, each with its certificate number, the officiant and the witnesses.",
    never: "Only when both are 18 or over. Never record the mahr, addresses, immigration or identity details.",
    addLabel: "Record a Nikah",
    dateLabel: "Date of the Nikah",
  },
};

export const SERVICES = [
  { key: "ghusl", word: "Ghusl" },
  { key: "kafan", word: "Kafan" },
  { key: "janazah_prayer", word: "Janazah prayer" },
  { key: "family_room", word: "Family room" },
] as const;
export type ServiceKey = (typeof SERVICES)[number]["key"];

export const CIVIL = { yes: "Yes", no: "No", unknown: "Not known" } as const;
export type Civil = keyof typeof CIVIL;

/** Longest name the database accepts. */
export const NAME_MAX = 120;
export const REASON_MAX = 500;
export const MAX_ON_DUTY = 10;
export const EARLIEST = "1950-01-01";

// ---------------------------------------------------------------------------
// Rows as the screens read them.
type Common = {
  id: number;
  number: string;
  first_id: number;
  corrects_id: number | null;
  correction_reason: string | null;
  service_date: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_reason: string | null;
  created_by: string | null;
  created_at: string;
};
export type FuneralRow = Common & {
  deceased_name: string;
  family_contact_name: string;
  family_contact_phone: string | null;
  ghusl: boolean;
  kafan: boolean;
  janazah_prayer: boolean;
  family_room: boolean;
  on_duty_person_ids: string[];
};
export type ShahadaRow = Common & { person_name: string; imam_person_id: string; witness_1: string | null; witness_2: string | null; adult_confirmed: boolean };
export type NikahRow = Common & {
  spouse_1_name: string;
  spouse_2_name: string;
  officiant_person_id: string;
  witness_1: string;
  witness_2: string;
  wali_name: string | null;
  civil_registration: Civil;
  adults_confirmed: boolean;
};
export type AnyRow = FuneralRow | ShahadaRow | NikahRow;
/** A row of the register view: the newest version, with how many versions there are. */
export type RegisterRow = AnyRow & { versions: number; first_recorded_at: string };

/** The entry's main name or names, for lists and titles. */
export function entryName(kind: RegisterKind, r: AnyRow): string {
  if (kind === "funerals") return (r as FuneralRow).deceased_name;
  if (kind === "shahada") return (r as ShahadaRow).person_name;
  const n = r as NikahRow;
  return `${n.spouse_1_name} and ${n.spouse_2_name}`;
}

/** The people from the directory an entry names. */
export function peopleOf(kind: RegisterKind, r: AnyRow): string[] {
  if (kind === "funerals") return (r as FuneralRow).on_duty_person_ids;
  if (kind === "shahada") return [(r as ShahadaRow).imam_person_id];
  return [(r as NikahRow).officiant_person_id];
}

export function servicesWords(r: FuneralRow): string {
  return SERVICES.filter((s) => r[s.key]).map((s) => s.word).join(", ");
}

// ---------------------------------------------------------------------------
// Reading a sent form.
function words(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  return t ? t : null;
}

function name(raw: string, what: string, required: boolean): Result<string | null> {
  const t = words(raw);
  if (!t) return required ? { ok: false, error: `Please fill in ${what}.` } : { ok: true, values: null };
  if (t.length > NAME_MAX) return { ok: false, error: `${what[0].toUpperCase()}${what.slice(1)} is too long (${NAME_MAX} characters at most).` };
  return { ok: true, values: t };
}

function date(raw: string, today: string): Result<string> {
  const d = raw.trim();
  if (!isDate(d)) return { ok: false, error: "Please give the date." };
  if (d > today) return { ok: false, error: "The date cannot be in the future." };
  if (d < EARLIEST) return { ok: false, error: "The date must be in 1950 or later." };
  return { ok: true, values: d };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE = /^\+?[0-9 ()-]+$/;

export type EntryValues = Record<string, string | boolean | string[] | null>;

/** Reads the form for one register. `getAll` returns every ticked box of a group. */
export function parseEntryForm(kind: RegisterKind, get: Get, getAll: (name: string) => string[], today: string): Result<EntryValues> {
  const when = date(get("service_date"), today);
  if (!when.ok) return when;
  const out: EntryValues = { service_date: when.values };
  const take = (field: string, what: string, required: boolean): string | null => {
    const r = name(get(field), what, required);
    if (!r.ok) throw new FormProblem(r.error);
    out[field] = r.values;
    return r.values;
  };
  const person = (field: string, what: string) => {
    const id = get(field).trim();
    if (!UUID.test(id)) throw new FormProblem(`Please pick ${what}.`);
    out[field] = id;
  };
  try {
    if (kind === "funerals") {
      take("deceased_name", "the name of the person who died", true);
      take("family_contact_name", "the family contact's name", true);
      const phone = words(get("family_contact_phone"));
      if (phone && (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 6 || phone.replace(/\D/g, "").length > 20)) {
        throw new FormProblem("The phone number should be 6 to 20 digits (spaces, brackets and a + at the start are fine).");
      }
      out.family_contact_phone = phone;
      const ticked = new Set(getAll("services"));
      for (const s of SERVICES) out[s.key] = ticked.has(s.key);
      if (!SERVICES.some((s) => out[s.key])) throw new FormProblem("Please tick at least one service the Centre gave.");
      const duty = [...new Set(getAll("on_duty").map((x) => x.trim()))];
      if (duty.length === 0) throw new FormProblem("Please tick who was on duty (at least one person).");
      if (duty.length > MAX_ON_DUTY) throw new FormProblem(`At most ${MAX_ON_DUTY} people on duty.`);
      if (!duty.every((d) => UUID.test(d))) throw new FormProblem("Please pick who was on duty from the list.");
      out.on_duty_person_ids = duty;
    } else if (kind === "shahada") {
      take("person_name", "the person's name", true);
      person("imam_person_id", "the authenticating imam");
      const w1 = take("witness_1", "the first witness's name", false);
      const w2 = take("witness_2", "the second witness's name", false);
      if (!w1 && w2) {
        out.witness_1 = w2;
        out.witness_2 = null;
      }
      if (get("adult_confirmed") !== "yes") throw new FormProblem("Please confirm the person is 18 or over. The register is for adults only.");
      out.adult_confirmed = true;
    } else {
      take("spouse_1_name", "the first spouse's name", true);
      take("spouse_2_name", "the second spouse's name", true);
      person("officiant_person_id", "the officiant");
      take("witness_1", "the first witness's name", true);
      take("witness_2", "the second witness's name", true);
      take("wali_name", "the wali's name", false);
      const civil = get("civil_registration");
      if (!(civil in CIVIL)) throw new FormProblem("Please say whether it was also registered as a civil marriage.");
      out.civil_registration = civil;
      if (get("adults_confirmed") !== "yes") throw new FormProblem("Please confirm both spouses are 18 or over. The register is for adults only.");
      out.adults_confirmed = true;
    }
  } catch (e) {
    if (e instanceof FormProblem) return { ok: false, error: e.message };
    throw e;
  }
  return { ok: true, values: out };
}

class FormProblem extends Error {}

/** A correction's or cancellation's reason. */
export function parseReason(raw: string, what: "correction" | "cancel"): Result<string> {
  const r = words(raw);
  if (!r) return { ok: false, error: what === "correction" ? "Please say what was wrong." : "Please say why this entry is cancelled." };
  if (r.length > REASON_MAX) return { ok: false, error: `The reason is too long (${REASON_MAX} characters at most).` };
  return { ok: true, values: r };
}

/** The database's own words where they are plain; a calm sentence otherwise. */
export function friendlyRegisterError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied|Only a Super Admin/i.test(message)) return "Your account is not allowed to do this. Only a Super Admin can.";
  if (/future|1950|switched off|reason|cancelled|corrected|newest version|people directory|listed once/i.test(message)) return message;
  return "That could not be saved. Please check the details and try again.";
}

/** "12 Mar 2026" style is formatDate's; this says how a list is narrowed. */
export function yearsFrom(today: string): number[] {
  const now = Number(today.slice(0, 4));
  return Array.from({ length: now - 1950 + 1 }, (_, i) => now - i);
}
