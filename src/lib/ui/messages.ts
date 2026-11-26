// Slice A1: which "?done=" messages are refusals. A refusal is shown in red
// and stays until it is closed; everything else is a success that fades.
// One list for every page, so a new refusal is marked in one place.
export type MessageTone = "success" | "error";

const REFUSALS = new Set([
  "not-allowed",
  "own-account",
  "own-vetting",
  "own-training",
  "own-signoff",
  "own-version",
  "pick-account",
  "pick-person",
  "link-refused",
  "roles-refused",
  "publish-refused",
  "review-passed",
  "withdraw-reason",
  "withdraw-refused",
  "failed",
  "test-failed",
  "test-not-set-up",
]);

export function messageTone(done: unknown): MessageTone {
  return typeof done === "string" && REFUSALS.has(done) ? "error" : "success";
}
