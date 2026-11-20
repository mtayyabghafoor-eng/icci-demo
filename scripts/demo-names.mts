// Demo-only names for the ICCI Staging demo (owner's choice, 19 Nov 2026).
//
// The development database and every test keep the plain "Test ..." names.
// Only "npm run db:seed:staging" swaps them for realistic, still clearly
// fictional names: real-style rooms and equipment of a Centre like
// Clonskeagh, people with the surname "Demo", no "(made up)" tags. The demo
// site shows a "Demo: all names and records are made up" banner instead.
//
// demoText() is applied to every text in the seed data. It only changes
// texts that start with "Test" or carry a "(made up)" tag, and running it
// twice gives the same result, so names that refer to each other (a ticket's
// place, a policy's owner) still match.

/** Places: real-style areas of the Centre. Globally unique, as the seed looks places up by name. */
const PLACES: Record<string, string> = {
  "Test Building A": "Main Mosque Building",
  "Test Building B": "Community and Education Wing",
  "Test Room A1": "Main Prayer Hall",
  "Test Room A2": "Women's Prayer Hall",
  "Test Room B1": "Library and Reading Room",
  "Test Store Room A1-1": "Prayer Hall Store",
  "Test Store Room A2-1": "Women's Section Store",
  "Test Store Room B1-1": "Library Store",
  "Test Shelf A1-1-1": "Prayer Hall Store Shelf 1",
  "Test Shelf A1-1-2": "Prayer Hall Store Shelf 2",
  "Test Shelf A1-1-3": "Prayer Hall Store Shelf 3",
  "Test Shelf A2-1-1": "Women's Section Store Shelf 1",
  "Test Shelf A2-1-2": "Women's Section Store Shelf 2",
  "Test Shelf B1-1-1": "Library Store Shelf 1",
  "Test Shelf B1-1-2": "Library Store Shelf 2",
};

/** Equipment: plain item names become what a Centre would actually call them. */
const ITEMS: Record<string, string> = {
  "Test folding chair": "Stacking chair",
  "Test table": "Folding trestle table",
  "Test bookcase": "Oak bookcase",
  "Test prayer carpet section": "Prayer carpet section",
  "Test speaker": "Wall speaker",
  "Test microphone": "Wireless microphone",
  "Test projector": "Ceiling projector",
  "Test laptop": "Office laptop",
  "Test kettle": "Urn kettle",
  "Test ladder": "Step ladder",
  "Test vacuum cleaner": "Commercial vacuum cleaner",
  "Test Quran stand": "Wooden Quran stand (rehal)",
  "Test bin bags": "Bin bags",
  "Test hand soap": "Hand soap refill",
  "Test paper towels": "Paper hand towels",
  "Test printer paper": "A4 printer paper",
  "Test pens": "Ballpoint pens",
  "Test tea bags": "Tea bags",
  "Test paper cups": "Paper cups",
};

/**
 * UI-9: whole texts that need a better demo wording than the general rules
 * give: the admin accounts (and their linked person records), the vehicles,
 * and the made-up disposal notes and names. Checked first.
 */
const EXACT: Record<string, string> = {
  "Test Super Admin": "Yusuf K. Demo",
  "Test Centre Admin": "Tariq A. Demo",
  "Test Second Admin": "Layla M. Demo",
  "Test Finance Officer": "Omar S. Demo",
  "Test Library Operator": "Maryam H. Demo",
  "Test Deactivated Admin": "Idris N. Demo",
  "Test Former Library Operator": "Huda R. Demo",
  "TEST-BUS-1": "ICCI-BUS-01",
  "TEST-VAN-1": "ICCI-VAN-01",
  "TEST-CAR-1": "ICCI-CAR-01",
  "Test minibus (made up)": "Community Minibus (16-seat)",
  "Test van (made up)": "Centre Transit Van",
  "Test car (made up)": "Admin Pool Car",
  "Sample Minibus 16-seat": "16-seat minibus",
  "Example Van": "Panel van",
  "Placeholder Hatchback": "Five-door hatchback",
  "Test disposal: made-up, beyond repair": "Damaged beyond economical repair during Hall refurbishment",
  "Test Buyer (made up)": "Hamza J. Demo",
  "Test Treasurer (made up)": "Treasurer",
  "Test Charity Shop (made up)": "Local charity shop",
};

/** People in the directory: first name, the old surname's initial, surname "Demo". */
const PERSON = /^Test ([A-Z][a-z]+) (Sample|Example|Placeholder|Madeup)$/;
/** Made-up book authors. */
const AUTHOR = /^Test Author ([A-Z])(2?) Example$/;
const AUTHOR_FIRST = ["Amal", "Bashir", "Celine", "Dawud", "Elif", "Faris", "Ghada", "Harun", "Iman", "Jamal", "Kawthar", "Luqman", "Muna"];

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function demoText(text: string): string {
  if (EXACT[text]) return EXACT[text];
  if (PLACES[text]) return PLACES[text];
  // Numbered equipment: "Test folding chair 07" -> "Stacking chair 07".
  const numbered = /^(.*) (\d{2})$/.exec(text);
  if (numbered && ITEMS[numbered[1]]) return `${ITEMS[numbered[1]]} ${numbered[2]}`;
  if (ITEMS[text]) return ITEMS[text];

  const person = PERSON.exec(text);
  if (person) return `${person[1]} ${person[2][0]}. Demo`;
  const author = AUTHOR.exec(text);
  if (author) {
    const i = author[1].charCodeAt(0) - 65;
    return `${AUTHOR_FIRST[i % AUTHOR_FIRST.length]} ${author[1]}.${author[2] ? " II" : ""} Example`;
  }
  const other = /^Test Author Other (\d+)$/.exec(text);
  if (other) return `Translator ${other[1]} Example`;

  let t = text
    .replace(/\s*\(made[ -]up\)/gi, "")
    .replace(/\s*\(تجريبي\)/g, "")
    .replace(/^تجريبي\s+/, "");
  const policy = /^Test policy: (.+)$/.exec(t);
  if (policy) return `${capitalise(policy[1])} policy`;
  t = t.replace(/^Test(?: (note|correction))?:\s*/i, (_m, word?: string) => (word ? `${capitalise(word)}: ` : ""));
  if (/^Test /.test(t)) t = t.replace(/^Test /, "");
  return t === text ? text : capitalise(t.trim());
}

/** Applies demoText to every text inside a value (objects and lists included). */
export function dressForDemo<T>(value: T): T {
  if (typeof value === "string") return demoText(value) as T;
  if (Array.isArray(value)) return value.map((v) => dressForDemo(v)) as T;
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, dressForDemo(v)])) as T;
  }
  return value;
}

/** Replaces the contents of a seed list in place, so every importer sees the demo names. */
export function dressListInPlace<T>(list: T[]): void {
  const dressed = list.map((v) => dressForDemo(v));
  list.splice(0, list.length, ...dressed);
}
