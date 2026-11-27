import { LinkButton, Notice } from "@/components/ui";
import { daysWithoutPrayerTime, type RotaWarning } from "@/lib/rota/week";

/**
 * A7: short lines under the summary. Why "Use a template" is not offered
 * (it only fills an empty week, so it never overwrites names), and missing
 * prayer times. E3: missing prayer times are said once, here, with a button
 * ("Prayer times missing for 5 days"), never beside every prayer slot.
 * Shared with Today's rota.
 */
export function RotaNotes({
  warnings,
  showTemplateNote = false,
  period = "week",
}: {
  warnings: Pick<RotaWarning, "kind" | "assignment_date">[];
  showTemplateNote?: boolean;
  period?: "week" | "today";
}) {
  const days = daysWithoutPrayerTime(warnings);
  if (days === 0 && !showTemplateNote) return null;
  return (
    <div className="-mt-2 mb-4 space-y-3 text-[15px] text-icci-ink-60">
      {days > 0 && (
        <Notice tone="warning" role="status" testId="prayer-time-note">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {period === "today"
                ? "Today's prayer times are not entered yet."
                : `Prayer times missing for ${days} ${days === 1 ? "day" : "days"} of this week.`}
            </span>
            <LinkButton kind="outline" href="/rota/prayer-times">
              Enter prayer times
            </LinkButton>
          </span>
        </Notice>
      )}
      {showTemplateNote && (
        <p data-testid="template-note">
          &ldquo;Use a template&rdquo; is only offered while nobody is on the week yet, so a template never replaces names. Add slots by hand
          instead.
        </p>
      )}
    </div>
  );
}
