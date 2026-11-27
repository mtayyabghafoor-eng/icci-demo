// One account (Round C5): where it stands, its history, and what a Super
// Admin can do: give a new temporary password, reset two-factor, switch it
// off or on, and link it to a person. Never to one's own account.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, ConfirmSubmit, fieldClass, PageNotice, PageShell, StatusBadge, buttonClass, CannotSee } from "@/components/ui";
import { accountState, EVENT_WORDS, MAY_MANAGE_ACCOUNTS, type AccountRow } from "@/lib/accounts/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { UUID } from "@/lib/forms";
import { formatDateTime } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { must } from "@/lib/supabase/must";
import { createClient } from "@/lib/supabase/server";
import { messageTone } from "@/lib/ui/messages";
import { linkPerson, setAccountActive } from "../actions";
import { ResetTwoFactorForm, TemporaryPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Account | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  "two-factor-reset": "Two-factor reset. At their next sign-in they set up their authenticator again.",
  "switched-off": "Account switched off. It can no longer sign in to anything.",
  "switched-on": "Account switched back on.",
  linked: "Linked to the person.",
  "pick-person": "Choose the person first.",
  "own-account": "You cannot do this to your own account. Ask another Super Admin.",
  "link-refused": "That person could not be linked (they may already be linked to another account).",
  "not-allowed": "Your account is not allowed to do this.",
};

export default function AccountPage(props: PageProps<"/accounts/[id]">) {
  return (
    <PageShell width="medium">
      <BackLink href="/accounts">Accounts</BackLink>
      <Content params={props.params} searchParams={props.searchParams} />
    </PageShell>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/accounts/[id]">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_MANAGE_ACCOUNTS.includes(me.roleCode)) return <CannotSee area="accounts" title="Account" />;
  const { id } = await params;
  const { done } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = must(await supabase.rpc("account_list"));
  const a = ((data ?? []) as AccountRow[]).find((x) => x.id === id);
  if (!a) notFound();
  const own = a.id === me.id;
  const [{ data: events }, people] = await Promise.all([
    supabase.from("account_events").select("id, kind, created_at, created_by").eq("account_id", id).order("id", { ascending: false }),
    a.person_id
      ? Promise.resolve([])
      : allRows<{ id: string; full_name: string }>((from, to) =>
          supabase.from("people").select("id, full_name").eq("active", true).is("app_user_id", null).order("full_name").order("id").range(from, to),
        ),
  ]);
  const names = new Map(((data ?? []) as AccountRow[]).map((x) => [x.id, x.display_name]));
  const s = accountState(a);

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 dir="auto" className="page-title text-[28px] md:text-[34px]">{a.display_name}</h1>
        <StatusBadge word={s.word} tone={s.tone} />
      </div>
      {typeof done === "string" && DONE[done] && (
        <PageNotice floating tone={messageTone(done)} testId="notice">
          {DONE[done]}
        </PageNotice>
      )}

      <dl className="facts">
        <dt>Email</dt>
        <dd>{a.email}</dd>
        <dt>Role</dt>
        <dd>{a.role_label}</dd>
        <dt>Signs in with</dt>
        <dd>{a.sign_in_method === "authenticator" ? `Password and authenticator app${a.has_authenticator ? "" : " (not set up yet)"}` : "A code emailed to this address"}</dd>
        {a.temporary_password_until && (
          <>
            <dt>Temporary password</dt>
            <dd>{s.word === "Temporary password ran out" ? "Ran out. Give a new one below." : `Works until ${formatDateTime(a.temporary_password_until)}.`}</dd>
          </>
        )}
        <dt>Last sign-in</dt>
        <dd>{a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : "Never"}</dd>
        <dt>Person</dt>
        <dd data-testid="linked-person">{a.person_name ? <a href={`/people/${a.person_id}`}>{a.person_name}</a> : "Not linked to anyone in the People directory"}</dd>
      </dl>

      {own ? (
        <p className="mt-5 rounded-xl border border-icci-line bg-white px-4 py-3" data-testid="own-account-note">
          This is your own account. Another Super Admin changes it, so nobody can lock themselves out by mistake.
        </p>
      ) : (
        <section className="mt-6 space-y-4" aria-labelledby="actions-title">
          <h2 id="actions-title" className="text-lg font-bold text-icci-green-dark">
            What you can do
          </h2>
          {a.active && a.sign_in_method === "authenticator" && (
            <div className="flex flex-wrap gap-3">
              <TemporaryPasswordForm accountId={a.id} name={a.display_name} />
              {a.has_authenticator && <ResetTwoFactorForm accountId={a.id} name={a.display_name} />}
            </div>
          )}
          {!a.person_id && a.active && (
            <form action={linkPerson.bind(null, a.id)} className="flex flex-wrap items-end gap-3" aria-label="Link to a person">
              <label className="min-w-64 flex-1">
                <span className="font-semibold">Link to a person in the People directory</span>
                <select name="person_id" defaultValue="" className={fieldClass}>
                  <option value="" disabled>
                    Choose the person
                  </option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonClass("outline", "md")}>
                Link
              </button>
            </form>
          )}
          <form action={setAccountActive.bind(null, a.id, !a.active)}>
            {a.active ? (
              <button type="submit" className={buttonClass("danger", "md")} data-testid="switch-off">
                Switch off
              </button>
            ) : (
              <ConfirmSubmit label="Switch back on" title={`Switch ${a.display_name}'s account back on?`} confirmLabel="Yes, switch on" kind="outline">
                They can sign in again the way their role allows.
              </ConfirmSubmit>
            )}
          </form>
        </section>
      )}

      <section className="mt-8" aria-labelledby="history-title">
        <h2 id="history-title" className="text-lg font-bold text-icci-green-dark">
          History
        </h2>
        <p className="text-sm">Every account action is kept. Newest first.</p>
        <ol dir="auto" className="mt-3 space-y-3 border-l-2 border-icci-gold pl-4" data-testid="account-history">
          {(events ?? []).map((e) => (
            <li key={e.id} className="rounded-xl border border-icci-line bg-white p-4 shadow-card">
              <span className="font-semibold">{EVENT_WORDS[e.kind] ?? e.kind}</span> · {formatDateTime(e.created_at)} ·{" "}
              {e.created_by ? (names.get(e.created_by) ?? "an admin") : "the system"}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
