import { Suspense } from "react";
import { AccountBlock } from "@/components/shell/account";
import { BottomBar } from "@/components/shell/bottom-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { requireAdmin } from "@/lib/auth/current-admin";
import { menuFor } from "@/lib/ui/menu";
import { signOut } from "../sign-in/actions";
import { IdleWatcher } from "./idle-watcher";

// Every signed-in page (docs/UI-PLAN.md section 4): the sidebar on a PC
// (icons only on a tablet), a slim top bar, the bottom bar and menu on a
// phone, and the 15-minute idle sign-out with its two-minute warning.
export default function SignedInLayout({ children }: LayoutProps<"/">) {
  // Nothing inside is shown until the sign-in has been checked.
  return (
    <Suspense fallback={<p className="px-4 py-8 text-center">Checking your sign-in…</p>}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

async function SignedInShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const out = signOut.bind(null, "signed-out");
  const canOpenLabels = menuFor(admin.roleCode).some((g) => g.links.some((l) => l.href === "/items"));
  const account = (testIds: boolean, compact: boolean) => (
    <AccountBlock name={admin.displayName} role={admin.roleLabel} signOut={out} compact={compact} testIds={testIds} />
  );
  return (
    <div className="flex min-h-full flex-1 flex-col md:pl-[72px] lg:pl-[264px] print:pl-0">
      {/* The first thing the Tab key reaches: jump past the menu to the page. */}
      <a
        href="#content"
        className="sr-only z-50 rounded-xl bg-icci-green-dark px-4 py-3 font-semibold text-white! no-underline focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to the page
      </a>
      <Sidebar roleCode={admin.roleCode} account={account(true, true)} />
      <TopBar canOpenLabels={canOpenLabels} signOut={out} />
      {/* Room at the bottom on a phone so the bottom bar never covers a button. */}
      <div id="content" tabIndex={-1} className="flex flex-1 flex-col pb-24 outline-none md:pb-0 print:pb-0">
        {children}
      </div>
      <BottomBar roleCode={admin.roleCode} account={account(false, false)} />
      <IdleWatcher serverNow={admin.serverNow} />
    </div>
  );
}
