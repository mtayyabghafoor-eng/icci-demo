// The accounts screen (Round C5, PLAN.md 3): every sign-in account, with its
// role, where it stands and the person it is linked to. Super Admins only;
// the database gives everyone else an empty list anyway.
import type { Metadata } from "next";
import Link from "next/link";
import { CannotSee, PageShell, PrimaryLink, StatusBadge } from "@/components/ui";
import { accountState, MAY_MANAGE_ACCOUNTS, type AccountRow } from "@/lib/accounts/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDateTime } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/must";

export const metadata: Metadata = { title: "Accounts | ICCI Control Dashboard" };

export default function AccountsPage() {
  return (
    <PageShell width="wide">
      <List />
    </PageShell>
  );
}

async function List() {
  const me = await requireAdmin();
  if (!MAY_MANAGE_ACCOUNTS.includes(me.roleCode)) return <CannotSee area="accounts" title="Accounts" />;
  const supabase = await createClient();
  const { data } = must(await supabase.rpc("account_list"));
  const accounts = ((data ?? []) as AccountRow[]).sort((a, b) => Number(b.active) - Number(a.active) || a.display_name.localeCompare(b.display_name));

  return (
    <>
      <h1 className="page-title text-[28px] md:text-[34px]">Accounts</h1>
      <p className="mt-2">
        Everyone who can sign in. Accounts are switched off, never deleted. A new admin gets a temporary password that works for 24 hours and
        opens nothing until they have set up their authenticator and chosen their own password.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="account-count">
          {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
        </p>
        <PrimaryLink href="/accounts/new">Add an account</PrimaryLink>
      </div>
      <div className="list-table-wrap">
        <table className="list-table mt-3 hidden md:table">
          <thead>
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Person</th>
              <th className="px-3 py-2">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const s = accountState(a);
              return (
                <tr key={a.id} className="border-b border-icci-panel align-top" data-testid="account-row">
                  <td className="px-3 py-2">
                    <Link dir="auto" href={`/accounts/${a.id}`} className="font-semibold">
                      {a.display_name}
                    </Link>
                    <span className="block text-sm text-icci-ink-60">{a.email}</span>
                  </td>
                  <td className="px-3 py-2">{a.role_label}</td>
                  <td className="px-3 py-2">
                    <StatusBadge word={s.word} tone={s.tone} />
                  </td>
                  <td className="px-3 py-2 text-sm">{a.person_name ?? "Not linked"}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">{a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : "Never"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {accounts.map((a) => {
          const s = accountState(a);
          return (
            <li key={a.id}>
              <Link href={`/accounts/${a.id}`} className="list-card" data-testid="account-row">
                <span className="flex items-start justify-between gap-2">
                  <span dir="auto" className="font-semibold text-icci-green">{a.display_name}</span>
                  <StatusBadge word={s.word} tone={s.tone} />
                </span>
                <span className="mt-1 block text-sm">
                  {a.role_label} · {a.email}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
