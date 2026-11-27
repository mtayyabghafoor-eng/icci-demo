// One person (slice P2.1): their details, Edit, and Switch off / Switch back
// on. P2.3 adds Garda vetting, P2.4 training. Later slices add policies here.
import { messageTone } from "@/lib/ui/messages";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { ASSET_EVENT_COLUMNS, describeEvent, type AssetEventRow } from "@/lib/assets/rules";
import { formatDate, formatDateTime } from "@/lib/items/rules";
import { accountChoices, MAY_SEE_PEOPLE, PERSON_STATUS, type Account } from "@/lib/people/rules";
import { SIGNOFF_STATUS, SQUARE_COLUMNS, type Square } from "@/lib/policies/signoffs";
import { createClient } from "@/lib/supabase/server";
import {
  TRAINING_RECORD_COLUMNS,
  TRAINING_ROW_COLUMNS,
  TRAINING_STATUS,
  TRAINING_TYPE_COLUMNS,
  trainingLine,
  worstFirst as trainingWorstFirst,
  type TrainingRecord,
  type TrainingRow,
  type TrainingType,
} from "@/lib/training/rules";
import {
  statusLine,
  todayInDublin,
  VETTING_KIND_LABEL,
  VETTING_RECORD_COLUMNS,
  VETTING_ROW_COLUMNS,
  VETTING_STATUS,
  type VettingRecord,
  type VettingRow,
} from "@/lib/vetting/rules";
import { loadLookups } from "../../items/data";
import { setPersonAccount, setPersonActive } from "../actions";
import { withdrawVetting } from "../vetting-actions";
import { withdrawTraining } from "../training-actions";
import { loadPeopleLists, PERSON_COLUMNS, type PersonRow } from "../data";
import { BackLink, buttonClass, CannotSee, ConfirmSubmit, PageNotice, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Person | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Person added.",
  saved: "Changes saved.",
  "switched-off": "Switched off. They stay on old records but cannot be picked for anything new.",
  "switched-on": "Switched back on.",
  "not-allowed": "Your account is not allowed to do this.",
  linked: "Admin account linked.",
  unlinked: "Link to the admin account removed.",
  "pick-account": "Pick an admin account first.",
  "own-account": "You cannot link or unlink your own account. Ask another Super Admin.",
  "link-refused": "That account could not be linked. It may already be linked to someone else.",
  "vetting-recorded": "Vetting recorded.",
  "vetting-withdrawn": "Entry withdrawn. It stays in the history, marked withdrawn.",
  "withdraw-reason": "Please say why the entry is wrong (500 characters at most).",
  "own-vetting": "Nobody can record or withdraw their own Garda vetting. Ask another admin.",
  "withdraw-refused": "That entry could not be withdrawn. It may already be withdrawn.",
  "training-recorded": "Training recorded.",
  "training-withdrawn": "Entry withdrawn. It stays in the history, marked withdrawn.",
  "own-training": "Nobody can record or withdraw their own training. Ask another admin.",
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  centre_admin: "Centre Admin",
  finance: "Finance",
  library_operator: "Library Operator",
};

export default function PersonPage(props: PageProps<"/people/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <BackLink href="/people">People</BackLink>
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/people/[id]">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSee area="people" />;
  const { id } = await params;
  const { done } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("people").select(PERSON_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as PersonRow;
  const [lists, accounts, links, reported, vettingRow, vettingHistory, trainingNow, trainingHistory, trainingTypes, policySquares] = await Promise.all([
    loadPeopleLists(supabase),
    supabase.from("app_users").select("id, display_name, role, active").order("display_name"),
    supabase.from("people").select("id, full_name, app_user_id").not("app_user_id", "is", null),
    supabase
      .from("asset_events")
      .select(ASSET_EVENT_COLUMNS)
      .eq("reported_by_person_id", p.id)
      .order("id", { ascending: false })
      .limit(50),
    supabase.from("people_vetting").select(VETTING_ROW_COLUMNS).eq("person_id", id).maybeSingle(),
    supabase
      .from("vetting_records")
      .select(VETTING_RECORD_COLUMNS)
      .eq("person_id", id)
      .order("happened_on", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("people_training").select(TRAINING_ROW_COLUMNS).eq("person_id", id),
    supabase
      .from("training_records")
      .select(TRAINING_RECORD_COLUMNS)
      .eq("person_id", id)
      .order("completed_on", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("training_types").select(TRAINING_TYPE_COLUMNS),
    supabase.from("policy_grid").select(SQUARE_COLUMNS).eq("person_id", id),
  ]);
  const vetting = vettingRow.data as VettingRow | null;
  const history = (vettingHistory.data ?? []) as VettingRecord[];
  const today = todayInDublin();
  const training = trainingWorstFirst((trainingNow.data ?? []) as TrainingRow[]);
  const trainingPast = (trainingHistory.data ?? []) as TrainingRecord[];
  const typeName = new Map(((trainingTypes.data ?? []) as TrainingType[]).map((t) => [t.id, t.name]));
  const isMe = p.app_user_id === me.id;
  const policies = [...((policySquares.data ?? []) as Square[])].sort(
    (a, b) => ["overdue", "unsigned", "signed"].indexOf(a.status) - ["overdue", "unsigned", "signed"].indexOf(b.status) || a.title.localeCompare(b.title),
  );
  const entries = (reported.data ?? []) as AssetEventRow[];
  const itemIds = [...new Set(entries.map((e) => e.item_id))];
  const [{ data: items }, places] = await Promise.all([
    itemIds.length ? supabase.from("items").select("id, name").in("id", itemIds) : Promise.resolve({ data: [] }),
    entries.length ? loadLookups(supabase) : Promise.resolve(null),
  ]);
  const itemName = new Map(((items ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]));
  const allAccounts = (accounts.data ?? []) as Account[];
  const myAccount = allAccounts.find((a) => a.id === p.app_user_id) ?? null;
  // Accounts linked to OTHER people, by account id → that person's name.
  const linkedTo = new Map(
    ((links.data ?? []) as { id: string; full_name: string; app_user_id: string }[])
      .filter((x) => x.id !== p.id)
      .map((x) => [x.app_user_id, x.full_name]),
  );
  const isSuper = me.roleCode === "super_admin";
  const choices = accountChoices(allAccounts, linkedTo, me.id);
  const adminName = (uid: string | null) => allAccounts.find((a) => a.id === uid)?.display_name ?? "an admin";
  const status = p.active ? PERSON_STATUS.active : PERSON_STATUS.off;
  const button = "inline-flex min-h-11 items-center justify-center rounded-[10px] border px-4 py-2 font-semibold transition-colors duration-150";

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]" dir="auto">
          {p.full_name}
        </h1>
        <span data-testid="person-status">
          <StatusBadge {...status} />
        </span>
      </div>
      {typeof done === "string" && DONE[done] && (
        <PageNotice floating tone={messageTone(done)} testId="notice">{DONE[done]}</PageNotice>
      )}

      <dl className="facts">
        <dt>Role</dt>
        <dd>
          {lists.roleName.get(p.person_role_id)}
          {lists.roles.find((r) => r.id === p.person_role_id)?.needs_vetting ? " (needs Garda vetting)" : ""}
        </dd>
        <dt>Section</dt>
        <dd dir="auto">{lists.sectionName.get(p.section_id)}</dd>
        <dt>Phone</dt>
        {/* D3: tap to call or email from a phone. */}
        <dd>
          {p.phone ? (
            <a href={`tel:${p.phone.replace(/[^0-9+]/g, "")}`} dir="ltr" data-testid="person-phone">
              {p.phone}
            </a>
          ) : (
            "Not recorded"
          )}
        </dd>
        <dt>Email</dt>
        <dd className="break-all">
          {p.email ? (
            <a href={`mailto:${p.email}`} data-testid="person-email">
              {p.email}
            </a>
          ) : (
            "Not recorded"
          )}
        </dd>
        <dt>Start date</dt>
        <dd>{formatDate(p.start_date)}</dd>
        <dt>Added</dt>
        <dd>{formatDate(p.created_at)}</dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        <SecondaryLink href={`/people/${p.id}/edit`}>Edit details</SecondaryLink>
        <form action={setPersonActive.bind(null, p.id, !p.active)}>
          {p.active ? (
            <button type="submit" className={buttonClass("danger")}>
              Switch off
            </button>
          ) : (
            <button type="submit" className={`${button} border-icci-green-dark bg-icci-green-dark text-white shadow-sm hover:bg-icci-green-900`}>
              Switch back on
            </button>
          )}
        </form>
      </div>
      <section className="mt-6 rounded-2xl border border-icci-line bg-white shadow-card p-5" data-testid="vetting">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-icci-green-dark">Garda vetting</h2>
          {vetting && (
            <span data-testid="vetting-status">
              <StatusBadge {...VETTING_STATUS[vetting.status]} />
            </span>
          )}
        </div>
        {vetting && <p className="mt-1">{statusLine(vetting, today)}</p>}
        {isMe ? (
          <p className="mt-3 text-sm">This is you. Nobody can record their own Garda vetting. Ask another admin.</p>
        ) : p.active ? (
          <div className="mt-3">
            <SecondaryLink href={`/people/${p.id}/vetting`}>Record vetting</SecondaryLink>
          </div>
        ) : (
          <p className="mt-3 text-sm">Switched off: switch them back on to record vetting.</p>
        )}
        <h3 className="mt-4 font-semibold">History</h3>
        {history.length === 0 ? (
          <p className="mt-1 text-sm" data-testid="vetting-history">
            Nothing recorded yet.
          </p>
        ) : (
          <ol className="mt-2 space-y-2" data-testid="vetting-history">
            {history.map((r) => (
              <li key={r.id} className={`rounded-md border p-3 ${r.withdrawn_at ? "border-dashed border-icci-text/40 bg-[#F0F0EE]" : "border-icci-panel bg-icci-panel"}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`font-semibold ${r.withdrawn_at ? "line-through" : ""}`}>
                    {VETTING_KIND_LABEL[r.kind]} on {formatDate(r.happened_on)}
                    {r.expires_on ? `, expires ${formatDate(r.expires_on)}` : ""}
                  </span>
                  {r.withdrawn_at && <StatusBadge word="Withdrawn" tone="grey" />}
                </span>
                <span className="block text-sm">
                  Entered by {adminName(r.created_by)}, {formatDateTime(r.created_at)}.
                </span>
                {r.withdrawn_at ? (
                  <span className="block text-sm">
                    Withdrawn by {adminName(r.withdrawn_by)}, {formatDateTime(r.withdrawn_at)}. Reason: {r.withdrawn_reason}
                  </span>
                ) : (
                  !isMe && (
                    <details className="mt-2">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Withdraw this entry</summary>
                      <form action={withdrawVetting.bind(null, p.id, r.id)} className="mt-2 flex flex-wrap items-end gap-3">
                        <label className="min-w-64 flex-1">
                          <span className="font-semibold">Why is it wrong?</span>
                          <input dir="auto" name="reason" required maxLength={500} className="mt-1 block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green" />
                        </label>
                        <button type="submit" className={`${button} border-icci-field bg-white text-icci-text hover:border-icci-green hover:bg-icci-green-50`}>
                          Withdraw
                        </button>
                      </form>
                    </details>
                  )
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-sm">Only the status and dates are kept, never the disclosure itself. Wrong entries are withdrawn, never deleted.</p>
      </section>

      <section className="mt-6 rounded-2xl border border-icci-line bg-white shadow-card p-5" data-testid="training">
        <h2 className="text-lg font-semibold text-icci-green-dark">Training</h2>
        {training.length === 0 ? (
          <p className="mt-1" data-testid="training-now">
            No training recorded.
          </p>
        ) : (
          <ul dir="auto" className="mt-2 space-y-2" data-testid="training-now">
            {training.map((t) => (
              <li key={t.training_type_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-icci-panel bg-icci-panel p-3">
                <span>
                  <span dir="auto" className="block font-semibold">{typeName.get(t.training_type_id) ?? "Training"}</span>
                  <span className="block text-sm">{trainingLine(t, today)}</span>
                </span>
                <StatusBadge {...TRAINING_STATUS[t.status]} />
              </li>
            ))}
          </ul>
        )}
        {isMe ? (
          <p className="mt-3 text-sm">This is you. Nobody can record their own training. Ask another admin.</p>
        ) : p.active ? (
          <div className="mt-3">
            <SecondaryLink href={`/people/${p.id}/training`}>Record training</SecondaryLink>
          </div>
        ) : (
          <p className="mt-3 text-sm">Switched off: switch them back on to record training.</p>
        )}
        {trainingPast.length > 0 && (
          <>
            <h3 className="mt-4 font-semibold">History</h3>
            <ol dir="auto" className="mt-2 space-y-2" data-testid="training-history">
              {trainingPast.map((r) => (
                <li key={r.id} className={`rounded-md border p-3 ${r.withdrawn_at ? "border-dashed border-icci-text/40 bg-[#F0F0EE]" : "border-icci-panel bg-icci-panel"}`}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${r.withdrawn_at ? "line-through" : ""}`}>
                      {typeName.get(r.training_type_id) ?? "Training"} done {formatDate(r.completed_on)}
                      {r.expires_on ? `, expires ${formatDate(r.expires_on)}` : ", no expiry"}
                    </span>
                    {r.withdrawn_at && <StatusBadge word="Withdrawn" tone="grey" />}
                  </span>
                  <span className="block text-sm">
                    Entered by {adminName(r.created_by)}, {formatDateTime(r.created_at)}.
                  </span>
                  {r.withdrawn_at ? (
                    <span className="block text-sm">
                      Withdrawn by {adminName(r.withdrawn_by)}, {formatDateTime(r.withdrawn_at)}. Reason: {r.withdrawn_reason}
                    </span>
                  ) : (
                    !isMe && (
                      <details className="mt-2">
                        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Withdraw this entry</summary>
                        <form action={withdrawTraining.bind(null, p.id, r.id)} className="mt-2 flex flex-wrap items-end gap-3">
                          <label className="min-w-64 flex-1">
                            <span className="font-semibold">Why is it wrong?</span>
                            <input dir="auto" name="reason" required maxLength={500} className="mt-1 block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green" />
                          </label>
                          <button type="submit" className={`${button} border-icci-field bg-white text-icci-text hover:border-icci-green hover:bg-icci-green-50`}>
                            Withdraw
                          </button>
                        </form>
                      </details>
                    )
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="mt-3 text-sm">Only the type and dates are kept, never the certificate. Wrong entries are withdrawn, never deleted.</p>
      </section>

      <section className="mt-6 rounded-2xl border border-icci-line bg-white shadow-card p-5" data-testid="person-policies">
        <h2 className="text-lg font-semibold text-icci-green-dark">Policies</h2>
        {policies.length === 0 ? (
          <p className="mt-2">No published policy applies to this person&rsquo;s role.</p>
        ) : (
          <ul className="mt-2 divide-y divide-icci-panel">
            {policies.map((q) => (
              <li key={q.policy_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link href={`/policies/${q.policy_id}`} className="font-semibold" dir="auto">
                    {q.title}
                  </Link>
                  <span className="block text-sm">
                    Version {q.version_label}
                    {q.signed_on ? `, signed ${formatDate(q.signed_on)}` : ""}
                  </span>
                </span>
                <StatusBadge {...SIGNOFF_STATUS[q.status]} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">
          {isMe ? "This is you. Another admin must record your sign-offs." : "Sign-offs are recorded on each policy’s page, several people at once."}
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-icci-line bg-white shadow-card p-5" data-testid="admin-account">
        <h2 className="text-lg font-semibold text-icci-green-dark">Admin account</h2>
        <p className="mt-1">
          {myAccount
            ? `Linked to ${myAccount.display_name} (${ROLE_LABEL[myAccount.role] ?? myAccount.role}).`
            : "Not linked to an admin account."}{" "}
          <span className="text-sm">This lets the system stop an admin approving or recording things about themselves.</span>
        </p>
        {isSuper && p.app_user_id === me.id && (
          <p className="mt-2 text-sm">This is your own account. Only another Super Admin can change this link.</p>
        )}
        {isSuper && p.app_user_id && p.app_user_id !== me.id && (
          <form action={setPersonAccount.bind(null, p.id)} className="mt-3">
            <input type="hidden" name="link" value="no" />
            <ConfirmSubmit label="Remove the link" title="Remove the link to this admin account?" confirmLabel="Yes, remove the link">
              Until it is linked again, the system cannot stop {myAccount?.display_name ?? "that admin"} approving or recording things
              about {p.full_name}. The change is kept in the history.
            </ConfirmSubmit>
          </form>
        )}
        {isSuper && !p.app_user_id && (
          <form action={setPersonAccount.bind(null, p.id)} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1">
              <span className="font-semibold">Admin account</span>
              <select name="app_user_id" required defaultValue="" className="mt-1 block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green">
                <option value="" disabled>
                  Pick an account
                </option>
                {choices.map((a) => (
                  <option key={a.id} value={a.id} disabled={a.disabled}>
                    {a.display_name} ({ROLE_LABEL[a.role] ?? a.role}){a.note ? ` (${a.note})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" name="link" value="yes" className={`${button} border-icci-green-dark bg-icci-green-dark text-white shadow-sm hover:bg-icci-green-900`}>
              Link this account
            </button>
          </form>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-icci-green-dark">Asset entries they reported</h2>
        {entries.length === 0 ? (
          <p className="mt-2" data-testid="reported-entries">
            None picked from the directory yet. (Older entries have names typed in.)
          </p>
        ) : (
          <ol dir="auto" className="mt-2 space-y-2" data-testid="reported-entries">
            {entries.map((e) => (
              <li key={e.id} className="rounded-xl border border-icci-line bg-white p-4 shadow-card">
                <Link dir="auto" href={`/items/${e.item_id}`} className="font-semibold">
                  {itemName.get(e.item_id) ?? "An item"}
                </Link>
                <span className="block">{describeEvent(e, places?.locationName ?? new Map())}</span>
                <span className="block text-sm">{formatDateTime(e.created_at)}</span>
              </li>
            ))}
          </ol>
        )}
        {entries.length === 50 && <p className="mt-1 text-sm">Showing the latest 50.</p>}
      </section>

      <p className="mt-6 text-sm">
        People are never deleted. Switching someone off keeps them on old records but stops them being picked for
        anything new.
      </p>
    </>
  );
}
