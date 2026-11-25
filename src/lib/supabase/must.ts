// Slice A6: a database read whose failure must never look like "nothing
// found". A list that could not be loaded must not say "Nothing is low" or
// "Nothing is overdue": it stops, and the page shows "This page could not be
// loaded" with "Try again" (src/app/(app)/error.tsx). The words stay in the
// server's log; the person sees only a reference number.
export function must<R extends { error: { message: string } | null }>(result: R): R {
  if (result.error) throw new Error(`A list could not be loaded: ${result.error.message}`);
  return result;
}
