// Who is signed in, Help and Sign out (bottom of the sidebar and the phone menu).
import { CircleHelp, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cx } from "@/lib/ui/text";

/** The user guide, served from public/help/ (behind the sign-in, like every page). */
export const HELP_GUIDE = "/help/ICCI-User-Guide.pdf";

export function AccountBlock({
  name,
  role,
  signOut,
  compact = false,
  testIds = false,
}: {
  name: string;
  role: string;
  signOut: () => Promise<void>;
  /** Tablet rail: the words are hidden until PC width. */
  compact?: boolean;
  /** Only one copy on the page carries the test id. */
  testIds?: boolean;
}) {
  const word = compact ? "sr-only lg:not-sr-only group-data-[open=true]/rail:not-sr-only" : "";
  return (
    <div className={cx("flex flex-col gap-3", compact && "items-center lg:items-stretch group-data-[open=true]/rail:items-stretch")}>
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <p className={cx("min-w-0 leading-tight", word)}>
          <span dir="auto" className="block truncate font-semibold text-white" data-testid={testIds ? "signed-in-name" : undefined}>
            {name}
          </span>
          <span className="block text-[13px] text-white/70" data-testid={testIds ? "signed-in-role" : undefined}>
            {role}
          </span>
        </p>
      </div>
      {/* E10: the user guide (a PDF, opened in a new tab; only for signed-in admins). */}
      <a
        href={HELP_GUIDE}
        target="_blank"
        rel="noopener"
        title={compact ? "Help: the user guide" : undefined}
        data-testid={testIds ? "help-link" : undefined}
        className={cx(
          "flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-white/90! no-underline transition-colors duration-150 hover:bg-white/8 hover:text-white!",
          compact ? "justify-center lg:justify-start group-data-[open=true]/rail:justify-start" : "justify-start",
        )}
      >
        <CircleHelp aria-hidden size={18} />
        <span className={word}>Help: the user guide</span>
      </a>
      <form action={signOut}>
        <button
          type="submit"
          title={compact ? "Sign out" : undefined}
          className={cx(
            "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-3 text-[15px] font-semibold text-white transition-colors duration-150 hover:border-icci-gold hover:bg-white/8",
            compact ? "lg:justify-start group-data-[open=true]/rail:justify-start" : "justify-start",
          )}
        >
          <LogOut aria-hidden size={18} />
          <span className={word}>Sign out</span>
        </button>
      </form>
    </div>
  );
}
