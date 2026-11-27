// Who is signed in, and Sign out (bottom of the sidebar and the phone menu).
import { LogOut } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cx } from "@/lib/ui/text";

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
