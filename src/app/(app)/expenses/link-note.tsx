// "Is my account linked to my record in People?" (docs/PHASE-5.md question
// 2A). Only a linked account can approve expenses, because that is how the
// database knows whether the approver paid. Shown on Expense settings and
// Finance's Home so nobody is surprised later. Asks the database
// (my_expense_link), which answers only about the signed-in account.
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export async function ExpenseLinkNote() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_expense_link");
  const row = (data as { linked: boolean; person_name: string | null }[] | null)?.[0];
  if (error || !row) return null;
  if (row.linked) {
    return (
      <Notice tone="info" testId="expense-link">
        Your account is linked to <span dir="auto">{row.person_name}</span> in People, so you can approve expense claims (never your own, and never
        money you paid).
      </Notice>
    );
  }
  return (
    <Notice tone="warning" title="You cannot approve expense claims yet" testId="expense-link">
      Your account is not linked to your record in People, so the system cannot check whether you paid for a claim. Ask a Super Admin to link it (on your
      record in People, under “Admin account”). A Super Admin cannot link their own account; another Super Admin does it.
    </Notice>
  );
}
