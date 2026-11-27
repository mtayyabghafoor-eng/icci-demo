// D8 (owner, 27 Nov 2026): one search box for the whole app. "People
// generally don't want to search for labels; it is more to search for
// items, names, policies, books." One question to the database per kind of
// record, all at once, each asked as the signed-in admin, so the database's
// own row rules decide what comes back. A role only gets the kinds its menu
// shows (Finance has none; the Library Operator gets books). A typed label
// number or place code still opens that label straight away.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSearch } from "@/lib/items/rules";
import { placeCode } from "@/lib/places/rules";
import { jumpFor } from "./jump";
import { menuFor } from "@/lib/ui/menu";

export type SearchHit = { href: string; title: string; detail: string | null };
export type SearchGroup = { key: GroupKey; title: string; hits: SearchHit[]; more: boolean; allHref: string | null };
export type SearchAnswer = { q: string; jump: { href: string; text: string } | null; groups: SearchGroup[] };

type GroupKey = "items" | "people" | "policies" | "books" | "companies" | "places" | "vehicles";

/** Each kind, the menu page that must be in the role's menu, and its "see all" page. */
const KINDS: Array<{ key: GroupKey; title: string; needs: string; all: ((q: string) => string) | null }> = [
  { key: "items", title: "Items", needs: "/items", all: (q) => `/items?q=${encodeURIComponent(q)}` },
  { key: "people", title: "People", needs: "/people", all: (q) => `/people?q=${encodeURIComponent(q)}` },
  { key: "policies", title: "Policies", needs: "/policies", all: null },
  { key: "books", title: "Library books", needs: "/library", all: (q) => `/library?q=${encodeURIComponent(q)}` },
  { key: "companies", title: "Companies", needs: "/companies", all: null },
  { key: "places", title: "Places", needs: "/places", all: null },
  { key: "vehicles", title: "Vehicles", needs: "/vehicles", all: null },
];

/** The kinds of record this role may search. */
export function searchKindsFor(roleCode: string): GroupKey[] {
  const links = new Set(menuFor(roleCode).flatMap((g) => g.links.map((l) => l.href)));
  return KINDS.filter((k) => links.has(k.needs)).map((k) => k.key);
}

/** Whether this role sees the search box at all. */
export function maySearch(roleCode: string): boolean {
  return searchKindsFor(roleCode).length > 0;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const join = (...parts: Array<string | null>) => parts.filter(Boolean).join(" · ") || null;

/** Search everything this role may see; `each` results per kind (one more is read to know if there are more). */
export async function searchEverything(supabase: SupabaseClient, raw: string, roleCode: string, each = 5): Promise<SearchAnswer> {
  const q = cleanSearch(raw);
  const jump = jumpFor(raw);
  if (q.length < 2) return { q, jump, groups: [] };
  const like = `*${q}*`;
  const n = each + 1;
  const kinds = new Set(searchKindsFor(roleCode));
  const digits = raw.replace(/[\s-]/g, "");

  const ask: Record<GroupKey, () => PromiseLike<{ data: Row[] | null }>> = {
    items: () =>
      supabase
        .from("items")
        .select("id, name, label_serial, maker_serial, kind")
        .or(`name.ilike.${like},label_serial.ilike.${like},maker_serial.ilike.${like}`)
        .order("name")
        .limit(n),
    people: () =>
      supabase
        .from("people")
        .select("id, full_name, phone, email, active")
        .or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .order("active", { ascending: false })
        .order("full_name")
        .limit(n),
    policies: () => supabase.from("policies").select("id, title, active").ilike("title", like.replaceAll("*", "%")).order("active", { ascending: false }).order("title").limit(n),
    books: () =>
      supabase
        .from("library_books")
        .select("id, title, author, isbn")
        .or([`title.ilike.${like}`, `author.ilike.${like}`, ...(/^[0-9X]{3,13}$/i.test(digits) ? [`isbn.ilike.*${digits}*`] : [])].join(","))
        .eq("active", true)
        .order("title")
        .limit(n),
    companies: () =>
      supabase.from("companies").select("id, name, phone, active").ilike("name", like.replaceAll("*", "%")).order("active", { ascending: false }).order("name").limit(n),
    places: () => supabase.from("locations").select("id, name, code, kind").ilike("name", like.replaceAll("*", "%")).eq("active", true).order("name").limit(n),
    vehicles: () =>
      supabase
        .from("vehicles")
        .select("id, registration, make_model")
        .or(`registration.ilike.${like},make_model.ilike.${like}`)
        .eq("active", true)
        .order("registration")
        .limit(n),
  };

  const show: Record<GroupKey, (r: Row) => SearchHit> = {
    items: (r) => ({ href: `/items/${r.id}`, title: String(r.name), detail: join(str(r.label_serial), r.kind === "consumable" ? "Supply" : null, str(r.maker_serial) && `Serial ${r.maker_serial}`) }),
    people: (r) => ({ href: `/people/${r.id}`, title: String(r.full_name), detail: join(str(r.phone), str(r.email), r.active ? null : "Switched off") }),
    policies: (r) => ({ href: `/policies/${r.id}`, title: String(r.title), detail: r.active ? null : "Switched off" }),
    books: (r) => ({ href: `/library/books/${r.id}`, title: String(r.title), detail: join(str(r.author), str(r.isbn) && `ISBN ${r.isbn}`) }),
    companies: (r) => ({ href: `/companies/${r.id}`, title: String(r.name), detail: join(str(r.phone), r.active ? null : "Switched off") }),
    places: (r) => ({ href: `/places/${r.id}`, title: String(r.name), detail: typeof r.code === "number" ? placeCode(r.code) : null }),
    vehicles: (r) => ({ href: `/vehicles/${r.id}`, title: String(r.registration), detail: str(r.make_model) }),
  };

  const chosen = KINDS.filter((k) => kinds.has(k.key));
  const answers = await Promise.all(chosen.map((k) => Promise.resolve(ask[k.key]()).then((a) => a.data ?? [], () => [] as Row[])));
  const groups: SearchGroup[] = chosen
    .map((k, i) => {
      const rows = answers[i];
      return { key: k.key, title: k.title, hits: rows.slice(0, each).map(show[k.key]), more: rows.length > each, allHref: k.all ? k.all(raw.trim()) : null };
    })
    .filter((g) => g.hits.length > 0);
  return { q, jump, groups };
}
