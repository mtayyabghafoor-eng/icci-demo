// Plain rules for the two-level category list (slice P1.17), kept free of
// the database and the screens so they can be unit-tested: "Main › Sub"
// names, what a main category includes, the order lists are shown in
// ("Other ..." always last), the add or rename form, and plain refusals.
//
// The database enforces the real rules (migration 0041): two levels only,
// items in a sub-category only, names unique across the whole list, nothing
// switched on inside a switched-off main category.

export type CategoryRow = { id: string; name: string; parent_id: string | null; active: boolean };

export type CategoryGroup = { main: CategoryRow; subs: CategoryRow[] };

export const MAX_CATEGORY_NAME = 60;

const OTHER = /^other\b/i;

/** By name, except that "Other" and "Other ..." always come last. */
export function compareCategoryNames(a: string, b: string): number {
  const ao = OTHER.test(a);
  const bo = OTHER.test(b);
  if (ao !== bo) return ao ? 1 : -1;
  return a.localeCompare(b, "en-IE", { numeric: true, sensitivity: "base" });
}

/** "Garden, tools and cleaning equipment › Lawnmowers"; a main category is its name alone. */
export function categoryPath(id: string, byId: Map<string, CategoryRow>): string {
  const c = byId.get(id);
  if (!c) return "Unknown category";
  const main = c.parent_id ? byId.get(c.parent_id) : undefined;
  return main ? `${main.name} › ${c.name}` : c.name;
}

/**
 * For "filter by category": a main category means itself and every
 * sub-category inside it (switched off ones too, so old items still show);
 * a sub-category means just itself.
 */
export function categoryAndInside(id: string, all: CategoryRow[]): string[] {
  return [id, ...all.filter((c) => c.parent_id === id).map((c) => c.id)];
}

/**
 * Main categories in order, each with its sub-categories in order.
 *   showOff:  include switched-off categories (the Categories screen).
 *   pickable: for a picker, leave out main categories with nothing to pick.
 *   keep:     a category to show even if switched off (an item's current one).
 */
export function categoryGroups(
  all: CategoryRow[],
  options: { showOff?: boolean; pickable?: boolean; keep?: string | null } = {},
): CategoryGroup[] {
  const shown = (c: CategoryRow) => options.showOff || c.active || c.id === options.keep;
  const keptMain = options.keep ? all.find((c) => c.id === options.keep)?.parent_id : null;
  return all
    .filter((c) => c.parent_id === null && (shown(c) || c.id === keptMain))
    .sort((a, b) => compareCategoryNames(a.name, b.name))
    .map((main) => ({
      main,
      subs: all.filter((c) => c.parent_id === main.id && shown(c)).sort((a, b) => compareCategoryNames(a.name, b.name)),
    }))
    .filter((g) => !options.pickable || g.subs.length > 0);
}

/** The add or rename form: a tidy name, 60 characters at most. */
export function parseCategoryForm(
  get: (name: string) => string,
): { ok: true; values: { name: string } } | { ok: false; error: string } {
  const name = get("name").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Please give the category a name." };
  if (name.length > MAX_CATEGORY_NAME) return { ok: false, error: `Keep the name to ${MAX_CATEGORY_NAME} characters or fewer.` };
  return { ok: true, values: { name } };
}

/** The database's refusals in plain words. Its own messages are already plain. */
export function friendlyCategoryError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/item_categories_unique_name|duplicate key/i.test(message)) {
    return "There is already a category called that. Choose another name.";
  }
  if (/sub-categor|main categor|switched off|inside itself|cannot become/i.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  return "That could not be saved. Please check the details and try again.";
}
