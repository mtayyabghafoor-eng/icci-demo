// D8: the grey hint in the search box, naming what this role can find.
// Kept apart from the search itself so the top bar (a client part) can use it.
export function searchHint(roleCode: string): string {
  return roleCode === "library_operator" ? "Search books, or a label number" : "Search items, people, books…";
}
