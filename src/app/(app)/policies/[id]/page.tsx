// One policy (slice P2.5): its details, who must sign it, every version
// (current, draft, replaced) with its PDF, "Upload a new version", and
// Publish. A different admin publishes: whoever uploaded or last changed the
// draft sees a note instead of the button (the database refuses it too).
// Sign-offs come in slice P2.6.
import { messageTone } from "@/lib/ui/messages";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, buttonClass, ConfirmSubmit } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate, formatDateTime } from "@/lib/items/rules";
import {
  MAY_SEE_POLICIES,
  mayPublish,
  POLICY_BUCKET,
  POLICY_ROW_COLUMNS,
  POLICY_VERSION_COLUMNS,
  REVIEW_STATUS,
  versionStatus,
  type PolicyRow,
  type PolicyVersion,
} from "@/lib/policies/rules";
import {
  SCAN_BUCKET,
  SIGNOFF_COLUMNS,
  SIGNOFF_STATUS,
  signedText,
  SQUARE_COLUMNS,
  worstFirst as worstSquaresFirst,
  type Signoff,
  type Square,
} from "@/lib/policies/signoffs";
import { createClient } from "@/lib/supabase/server";
import { Notice, SecondaryLink, StatusBadge } from "../../items/ui";
import { publishVersion, saveRequiredRoles, setPolicyActive } from "../actions";
import { CannotSeePolicies } from "../cannot-see";
import { withdrawSignoff } from "../signoff-actions";
import { roleChoices } from "../data";
import { RoleBoxes } from "../forms";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Policy | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Policy added. Now upload its first version.",
  saved: "Changes saved.",
  "roles-saved": "Saved who must sign.",
  "roles-refused": "Who must sign could not be saved. Please try again.",
  "switched-off": "Switched off. Its versions stay, but nothing new can be added or published.",
  "switched-on": "Switched back on.",
  "draft-added": "Draft uploaded. A different admin must now check it and publish it.",
  "draft-saved": "Draft saved. A different admin must now check it and publish it.",
  published: "Published. This is now the current version.",
  "own-version": "You uploaded or last changed this draft, so a different admin must publish it.",
  "review-passed": "The next review date has already passed. Change the draft before publishing.",
  "publish-refused": "That version could not be published. It may already be published.",
  "not-allowed": "Your account is not allowed to do this.",
  signed: "Sign-off recorded.",
  "signoff-withdrawn": "Sign-off withdrawn. It stays in the list, marked withdrawn.",
  "withdraw-reason": "Please say why the entry is wrong (500 characters at most).",
  "own-signoff": "Nobody can record or withdraw their own sign-off. Ask another admin.",
  "withdraw-refused": "That sign-off could not be withdrawn. It may already be withdrawn.",
};

export default function PolicyPage(props: PageProps<"/policies/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <BackLink href="/policies">Policies</BackLink>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/policies/[id]">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSeePolicies />;
  const { id } = await params;
  const { done, n } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("policies_overview").select(POLICY_ROW_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as PolicyRow;
  const [owner, versionsRes, required, roles, accounts, squaresRes, signoffsRes] = await Promise.all([
    supabase.from("people").select("id, full_name, active").eq("id", p.owner_person_id).maybeSingle(),
    supabase.from("policy_versions").select(POLICY_VERSION_COLUMNS).eq("policy_id", id).order("created_at", { ascending: false }),
    supabase.from("policy_required_roles").select("person_role_id").eq("policy_id", id).eq("active", true),
    roleChoices(supabase),
    supabase.from("app_users").select("id, display_name"),
    supabase.from("policy_grid").select(SQUARE_COLUMNS).eq("policy_id", id),
    p.current_version_id
      ? supabase
          .from("policy_signoffs")
          .select(SIGNOFF_COLUMNS)
          .eq("policy_version_id", p.current_version_id)
          .order("signed_on", { ascending: false })
          .order("id", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const squares = worstSquaresFirst((squaresRes.data ?? []) as Square[]);
  const signoffs = (signoffsRes.data ?? []) as Signoff[];
  const signerIds = [...new Set(signoffs.map((x) => x.person_id))];
  const scanPaths = [...new Set(signoffs.flatMap((x) => (x.scan_path ? [x.scan_path] : [])))];
  const [{ data: signers }, { data: myPerson }, scanLinks] = await Promise.all([
    signerIds.length ? supabase.from("people").select("id, full_name").in("id", signerIds) : Promise.resolve({ data: [] }),
    supabase.from("people").select("id").eq("app_user_id", me.id).maybeSingle(),
    scanPaths.length ? supabase.storage.from(SCAN_BUCKET).createSignedUrls(scanPaths, 600) : Promise.resolve({ data: [] }),
  ]);
  const signerName = new Map(((signers ?? []) as { id: string; full_name: string }[]).map((x) => [x.id, x.full_name]));
  const myPersonId = (myPerson as { id: string } | null)?.id ?? null;
  const scanLink = new Map(((scanLinks.data ?? []) as { path: string | null; signedUrl: string }[]).map((l) => [l.path, l.signedUrl]));
  const versions = (versionsRes.data ?? []) as PolicyVersion[];
  const draft = versions.find((v) => v.status === "draft") ?? null;
  const picked = new Set(((required.data ?? []) as { person_role_id: string }[]).map((r) => r.person_role_id));
  const adminName = (uid: string | null) =>
    ((accounts.data ?? []) as { id: string; display_name: string }[]).find((a) => a.id === uid)?.display_name ?? "an admin";
  const links = versions.length
    ? await supabase.storage.from(POLICY_BUCKET).createSignedUrls(
        versions.map((v) => v.file_path),
        600,
      )
    : { data: [] };
  const pdfLink = new Map((links.data ?? []).map((l) => [l.path, l.signedUrl]));
  const ownerRow = owner.data as { full_name: string; active: boolean } | null;
  const button = "inline-flex min-h-11 items-center justify-center rounded-[10px] border px-4 py-2 font-semibold transition-colors duration-150";

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]" dir="auto">
          {p.title}
        </h1>
        <span data-testid="review-status">
          <StatusBadge {...REVIEW_STATUS[p.review_status]} />
        </span>
        {!p.active && <StatusBadge word="Switched off" tone="grey" />}
      </div>
      {typeof done === "string" && DONE[done] && (
        <Notice floating tone={messageTone(done)} testId="notice">{done === "signed" && typeof n === "string" && /^\d+$/.test(n) && n !== "1" ? `Sign-offs recorded for ${n} people.` : DONE[done]}</Notice>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-2xl border border-icci-line bg-white p-5 shadow-card sm:grid-cols-[11rem_1fr]">
        <dt className="text-sm font-semibold text-icci-ink-60">Owner</dt>
        <dd dir="auto">
          {ownerRow ? `${ownerRow.full_name}${ownerRow.active ? "" : " (switched off)"}` : "Not known"}
        </dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Current version</dt>
        <dd data-testid="current-version">{p.current_label ?? "None published yet"}</dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Approved</dt>
        <dd>{p.approved_on ? formatDate(p.approved_on) : "–"}</dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Next review</dt>
        <dd>{p.next_review_on ? formatDate(p.next_review_on) : "–"}</dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Must sign</dt>
        <dd data-testid="must-sign">
          {p.must_sign === 0 ? "Nobody yet. Tick the roles below." : `${p.must_sign} switched-on ${p.must_sign === 1 ? "person" : "people"}`}
          {squares.length > 0 && (
            <span className="block text-sm" data-testid="signed-count">
              {signedText(squares)}
            </span>
          )}
        </dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        <SecondaryLink href={`/policies/${p.id}/edit`}>Change title or owner</SecondaryLink>
        <form action={setPolicyActive.bind(null, p.id, !p.active)}>
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

      <section className="mt-6 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="versions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-icci-green-dark">Versions</h2>
          {p.active && !draft && <SecondaryLink href={`/policies/${p.id}/upload`}>Upload a new version</SecondaryLink>}
        </div>
        {versions.length === 0 ? (
          <p className="mt-2">No versions yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {versions.map((v) => (
              <li key={v.id} data-testid="version" className={`rounded-xl border p-4 ${v.status === "draft" ? "border-[var(--icci-warn-text)]/40 bg-[var(--icci-warn-fill)]/40" : "border-icci-line"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold">{v.version_label}</span>
                  <StatusBadge {...versionStatus(v, p.current_version_id)} />
                </div>
                <p className="mt-1 text-sm">
                  Approved {formatDate(v.approved_on)}. Next review {formatDate(v.next_review_on)}.
                </p>
                <p className="text-sm">
                  Uploaded by {adminName(v.created_by)}, {formatDateTime(v.created_at)}.
                  {v.status === "draft" && v.updated_by && v.updated_by !== v.created_by ? ` Last changed by ${adminName(v.updated_by)}.` : ""}
                  {v.published_at ? ` Published by ${adminName(v.published_by)}, ${formatDateTime(v.published_at)}.` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {pdfLink.get(v.file_path) && (
                    <a href={pdfLink.get(v.file_path) ?? undefined} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
                      Open PDF
                    </a>
                  )}
                  {v.status === "draft" && (
                    <>
                      <SecondaryLink href={`/policies/${p.id}/versions/${v.id}`}>Change this draft</SecondaryLink>
                      {!p.active ? null : mayPublish(v, me.id) ? (
                        <form action={publishVersion.bind(null, p.id, v.id)}>
                          <ConfirmSubmit kind="primary" label="Publish" title={`Publish ${v.version_label}?`} confirmLabel="Yes, publish">
                            It becomes the current version straight away and can never be changed. Everyone who must sign this
                            policy will be asked to sign this version.
                          </ConfirmSubmit>
                        </form>
                      ) : (
                        <p className="text-sm" data-testid="own-draft">
                          You uploaded or last changed this draft, so a different admin must publish it.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">A published version can never be changed or deleted. To update a policy, upload a new version.</p>
      </section>

      <section className="mt-6 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="signoffs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-icci-green-dark">Sign-offs{p.current_label ? ` for ${p.current_label}` : ""}</h2>
          {p.active && p.current_version_id && squares.some((q) => q.status !== "signed") && (
            <SecondaryLink href={`/policies/${p.id}/sign-off`}>Record sign-off</SecondaryLink>
          )}
        </div>
        {!p.current_version_id ? (
          <p className="mt-2">Nothing is published yet, so nobody can sign.</p>
        ) : squares.length === 0 ? (
          <p className="mt-2">Nobody must sign this policy. Tick the roles under &ldquo;Who must sign&rdquo;.</p>
        ) : (
          <>
            <p className="mt-1">
              {signedText(squares)}. &ldquo;Overdue&rdquo; means still unsigned 30 days after publishing. A new version starts everyone at
              unsigned.
            </p>
            <ul className="mt-3 divide-y divide-icci-panel" data-testid="signoff-squares">
              {squares.map((q) => (
                <li key={q.person_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/people/${q.person_id}`} dir="auto">
                    {q.full_name}
                  </Link>
                  <span className="flex items-center gap-3 text-sm">
                    {q.signed_on && <span>Signed {formatDate(q.signed_on)}</span>}
                    <StatusBadge {...SIGNOFF_STATUS[q.status]} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {signoffs.length > 0 && (
          <>
            <h3 className="mt-5 font-semibold">Entries for this version</h3>
            <ol className="mt-2 space-y-3" data-testid="signoff-history">
              {signoffs.map((x) => (
                <li key={x.id} className={`rounded-xl border p-4 ${x.withdrawn_at ? "border-dashed border-icci-text/40 bg-[#F0F0EE]" : "border-icci-line"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold" dir="auto">
                      {signerName.get(x.person_id) ?? "Someone"}, signed {formatDate(x.signed_on)}
                    </span>
                    {x.withdrawn_at && <StatusBadge word="Withdrawn" tone="grey" />}
                  </div>
                  <p className="text-sm">
                    Entered by {adminName(x.created_by)}, {formatDateTime(x.created_at)}.
                  </p>
                  {x.withdrawn_at && (
                    <p className="text-sm">
                      Withdrawn by {adminName(x.withdrawn_by)}, {formatDateTime(x.withdrawn_at)}. Reason: {x.withdrawn_reason}
                    </p>
                  )}
                  {x.scan_path && scanLink.get(x.scan_path) && (
                    <div className="mt-2">
                      <a href={scanLink.get(x.scan_path) ?? undefined} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
                        Open scan
                      </a>
                    </div>
                  )}
                  {!x.withdrawn_at && x.person_id !== myPersonId && (
                    <details className="mt-2">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Withdraw this entry</summary>
                      <form action={withdrawSignoff.bind(null, p.id, x.id)} className="mt-2 flex flex-wrap items-end gap-3">
                        <label className="min-w-64 flex-1">
                          <span className="font-semibold">Why is it wrong?</span>
                          <input
                            name="reason"
                            required
                            maxLength={500}
                            className="mt-1 block min-h-11 w-full rounded-xl border border-[#87948f] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green"
                          />
                        </label>
                        <button type="submit" className={`${button} border-[#87948f] bg-white text-icci-text hover:border-icci-green hover:bg-icci-green-50`}>
                          Withdraw
                        </button>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="required-roles">
        <h2 className="text-lg font-semibold text-icci-green-dark">Who must sign</h2>
        <form action={saveRequiredRoles.bind(null, p.id)} className="mt-3 space-y-3" aria-label="Who must sign">
          <RoleBoxes roles={roles} picked={picked} quiet />
          <button type="submit" className={buttonClass("outline")}>
            Save who must sign
          </button>
        </form>
      </section>
    </>
  );
}
