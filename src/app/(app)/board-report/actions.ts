"use server";
// "Make the final copy" of a month's Board report (slice P5.6). The
// database makes it from its own numbers and refuses an open month.
import { redirect } from "next/navigation";
import { friendlyClaimError, monthRange } from "@/lib/expenses/claims";
import { isMonth } from "@/lib/action-input";
import { createClient } from "@/lib/supabase/server";

export type CopyState = { error: string | null };

export async function makeFinalCopy(month: string): Promise<CopyState> {
  // Round C3: anything but a month written 2026-11 is refused first.
  if (!isMonth(month) || !monthRange(month)) return { error: "Choose a month." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("make_board_report_copy", { p_month: month });
  if (error || typeof data !== "number") return { error: friendlyClaimError(error?.message) };
  redirect(`/board-report?month=${month}&copy=${data}&done=copied`);
}
