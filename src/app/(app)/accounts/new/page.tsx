// Add an account (Round C5). Super Admins only.
import type { Metadata } from "next";
import { BackLink, CannotSee, PageShell } from "@/components/ui";
import { MAY_MANAGE_ACCOUNTS } from "@/lib/accounts/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { AddAccountForm } from "../forms";

export const metadata: Metadata = { title: "Add an Account | ICCI Control Dashboard" };

export default function NewAccountPage() {
  return (
    <PageShell width="narrow">
      <Content />
    </PageShell>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!MAY_MANAGE_ACCOUNTS.includes(me.roleCode)) return <CannotSee area="accounts" title="Add an Account" />;
  return (
    <>
      <BackLink href="/accounts">Accounts</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Add an Account</h1>
      <p className="mt-2">
        For a real person only once the Centre is using the system. Admin roles get a one-time temporary password, shown on the next screen.
      </p>
      <AddAccountForm />
    </>
  );
}
