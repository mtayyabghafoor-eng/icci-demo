// Demo-only names for the ICCI Staging demo (owner's choice, 19 Nov 2026;
// made realistic 22 Nov 2026: male Arabic names for the administration, no
// "Demo" or "Example" anywhere, phone numbers that look Irish).
//
// The development database and every test keep the plain "Test ..." names.
// Only "npm run db:seed:staging" swaps them for realistic names: real-style
// rooms and equipment of a Centre like Clonskeagh, invented people (never
// real ICCI staff), no "(made up)" tags. Phone numbers become Dublin numbers
// in the unused 01 000 range, so they can never ring a real person.
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
  // The mosque's administration is all men (owner, 22 Nov 2026).
  "Test Super Admin": "Yusuf Al-Karimi",
  "Test Centre Admin": "Tariq Abdelrahman",
  "Test Second Admin": "Luqman Al-Masri",
  "Test Finance Officer": "Omar Salim",
  "Test Library Operator": "Mahmoud Haddad",
  "Test Deactivated Admin": "Idris Nasser",
  "Test Former Library Operator": "Hassan Rahimi",
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
  "Test Buyer (made up)": "Hamza Jaber",
  "Test Treasurer (made up)": "Treasurer",
  "Test Charity Shop (made up)": "Local charity shop",
  // 22 Nov 2026: notes that still said "made-up".
  "Test move: needed for a made-up event": "Moved for the Friday community event",
  "Test report: made-up damage found at the weekly check": "Damage found at the weekly check",
  "Test report: made-up scratch on the top": "Scratch on the top, noticed after an event",
  "Test note: made-up address": "Renewed through the registrar's account",
  "دار تجريبية للنشر": "دار النور للنشر",
};

/** People in the directory: an invented male Arabic first name and family name. */
const PERSON = /^Test ([A-Z][a-z]+) (Sample|Example|Placeholder|Madeup)$/;
const MALE_FIRST: Record<string, string> = {
  Amina: "Abdullah",
  Yusuf: "Yusuf",
  Mariam: "Ibrahim",
  Omar: "Omar",
  Fatima: "Khalid",
  Bilal: "Bilal",
  Khadija: "Mustafa",
  Hamza: "Hamza",
  Zainab: "Zakariya",
  Idris: "Idris",
};
const FAMILY: Record<string, string> = { Sample: "Haddad", Example: "Mansour", Placeholder: "Siddiqui", Madeup: "Al-Amin" };
/** Library borrowers: the community, men and women. */
const BORROWER = /^Test ([A-Z][a-z]+) (Pageturner|Bookend)$/;
const BORROWER_FAMILY: Record<string, string> = { Pageturner: "Qureshi", Bookend: "Farouk" };
/** Made-up book authors. */
const AUTHOR = /^Test Author ([A-Z])(2?) Example$/;
const AUTHOR_FIRST = ["Amal", "Bashir", "Dawud", "Faris", "Ghassan", "Harun", "Iman", "Jamal", "Kamal", "Luqman", "Muna", "Nabil", "Rashid"];
const AUTHOR_FAMILY = ["Al-Hashimi", "Nadwi", "Sabri", "Ghazali", "Rifai", "Tahir"];
/** A test phone number becomes a Dublin number in the unused 01 000 range. */
const PHONE = /^\+353 00 000 (\d{4})$/;

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
  if (person) return `${MALE_FIRST[person[1]] ?? person[1]} ${FAMILY[person[2]]}`;
  const borrower = BORROWER.exec(text);
  if (borrower) return `${borrower[1]} ${BORROWER_FAMILY[borrower[2]]}`;
  const phone = PHONE.exec(text);
  if (phone) return `01 000 ${phone[1]}`;
  const author = AUTHOR.exec(text);
  if (author) {
    const i = author[1].charCodeAt(0) - 65;
    return `${AUTHOR_FIRST[i % AUTHOR_FIRST.length]} ${AUTHOR_FAMILY[(i + (author[2] ? 3 : 0)) % AUTHOR_FAMILY.length]}`;
  }
  const other = /^Test Author Other (\d+)$/.exec(text);
  if (other) return `${AUTHOR_FIRST[(Number(other[1]) + 5) % AUTHOR_FIRST.length]} ${AUTHOR_FAMILY[Number(other[1]) % AUTHOR_FAMILY.length]}`;

  let t = text
    // Arabic authors: "المثال" ("the example") becomes a family name.
    .replace(/ المثال$/, " الهاشمي")
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
