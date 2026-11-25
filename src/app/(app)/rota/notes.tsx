import Link from "next/link";
import type { RotaWarning } from "@/lib/rota/week";

/**
 * A7: two short lines under the summary. Why "Use a template" is not offered
 * (it only fills an empty week, so it never overwrites names), and a link to
 * Prayer times when a prayer has no time yet. Shared with Today's rota.
 */
export function RotaNotes({ warnings, showTemplateNote = false }: { warnings: RotaWarning[]; showTemplateNote?: boolean }) {
  const noTime = warnings.some((w) => w.kind === "no_prayer_time");
  if (!noTime && !showTemplateNote) return null;
  return (
    <div className="-mt-2 mb-4 space-y-1 text-[15px] text-icci-ink-60">
      {noTime && (
        <p data-testid="prayer-time-note">
          Some prayers have no time entered yet.{" "}
          <Link href="/rota/prayer-times" className="font-semibold">
            Enter prayer times
          </Link>
        </p>
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
