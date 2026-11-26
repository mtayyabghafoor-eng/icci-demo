// "If this goes wrong" (slice P1.21, owner approved 21 Nov 2026): everything
// an admin needs when an asset breaks, in one place. Shown on the item page,
// the ticket page and the "Report a problem" page.
//   * the make and model, and the maker's serial number
//   * warranty: under warranty until … (then the supplier, for warranty
//     claims), ended, or not recorded
//   * who to call: the item's service company, else its model's, else its
//     sub-category's, else its main category's (tap to call)
//   * the maker, and the staff contact person for this category
//   * the manuals and documents, and how many tickets it has had
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { Card, CardTitle, StatusBadge } from "@/components/ui";
import { contactPerson, telLink, warrantyStatus, whoToCall, type CallSource, type CompanyRow } from "@/lib/companies/rules";
import { formatDate } from "@/lib/items/rules";
import { todayInDublin } from "@/lib/vetting/rules";
import { createClient } from "@/lib/supabase/server";
import { allCategories } from "../categories/data";
import { DocumentList, documentsOf } from "../documents/documents-card";
import { allCompanies, allModels } from "./data";

const FROM: Record<CallSource, string> = {
  item: "set for this item",
  model: "services this make and model",
  "sub-category": "usual company for this kind of thing",
  "main category": "usual company for this main category",
};

function CompanyLine({ company, why, testId }: { company: CompanyRow; why: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-icci-line bg-white p-3" data-testid={testId}>
      <p className="font-semibold">
        <Link href={`/companies/${company.id}`}>{company.name}</Link> <span className="text-sm font-normal text-icci-ink-60">· {why}</span>
      </p>
      <p className="mt-1.5 flex flex-wrap gap-2">
        {company.phone ? (
          <a href={telLink(company.phone)} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white! no-underline">
            <Phone aria-hidden size={18} />
            Call {company.phone}
          </a>
        ) : (
          <span className="text-sm">No phone number recorded.</span>
        )}
        {company.email && (
          <a href={`mailto:${company.email}`} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-icci-line px-4 font-semibold no-underline">
            <Mail aria-hidden size={18} />
            Email
          </a>
        )}
      </p>
    </div>
  );
}

/** Everything needed to say who to call about one fixed asset (null for anything else). */
export async function contactContext(supabase: Awaited<ReturnType<typeof createClient>>, itemId: string) {
  const { data: item } = await supabase
    .from("items")
    .select("id, kind, category_id, model_id, maker_serial, supplier_company_id, service_company_id, warranty_end")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.kind !== "fixed_asset") return null;
  const [companies, models, categories] = await Promise.all([allCompanies(supabase), allModels(supabase), allCategories(supabase)]);
  const company = new Map(companies.map((c) => [c.id, c]));
  const model = item.model_id ? (models.find((m) => m.id === item.model_id) ?? null) : null;
  const sub = categories.find((c) => c.id === item.category_id) ?? null;
  const main = sub?.parent_id ? (categories.find((c) => c.id === sub.parent_id) ?? null) : null;
  const call = whoToCall(item, model, sub, main);
  return { item, companies, company, model, sub, main, call };
}

export async function ContactCard({ itemId }: { itemId: string }) {
  const supabase = await createClient();
  const [context, tickets] = await Promise.all([
    contactContext(supabase, itemId),
    supabase.from("maintenance_tickets").select("id", { count: "exact", head: true }).eq("item_id", itemId),
  ]);
  if (!context) return null;
  const { item, company, model, sub, main, call } = context;
  const callCompany = call ? company.get(call.companyId) : undefined;
  const maker = model ? company.get(model.maker_company_id) : undefined;
  const supplier = item.supplier_company_id ? company.get(item.supplier_company_id) : undefined;
  const warranty = warrantyStatus(item.warranty_end, todayInDublin());
  const personId = contactPerson(sub, main);
  const { data: person } = personId
    ? await supabase.from("people").select("full_name, phone").eq("id", personId).maybeSingle()
    : { data: null };
  const [modelDocs, itemDocs] = await Promise.all([model ? documentsOf({ model_id: model.id }) : [], documentsOf({ item_id: itemId })]);
  const docs = [...modelDocs, ...itemDocs];

  return (
    <Card>
      <CardTitle>If this goes wrong</CardTitle>
      <div className="space-y-3" data-testid="contact-card">
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge
            word={warranty.state === "under" ? `${warranty.word} until ${formatDate(item.warranty_end)}` : warranty.word}
            tone={warranty.tone}
            testId="warranty-status"
          />
          <span className="text-sm">
            {model ? (
              <>
                <Link href={`/models/${model.id}`}>
                  {maker?.name ?? ""} {model.model_name}
                </Link>
                {item.maker_serial ? ` · serial ${item.maker_serial}` : ""}
              </>
            ) : (
              "Make and model not recorded"
            )}
          </span>
        </p>

        {warranty.state === "under" && supplier && <CompanyLine company={supplier} why="supplier, for a warranty claim" testId="warranty-contact" />}

        {callCompany ? (
          <CompanyLine company={callCompany} why={FROM[call!.from]} testId="who-to-call" />
        ) : (
          <p className="rounded-xl border border-dashed border-icci-gold-300 bg-white p-3 text-sm" data-testid="who-to-call">
            No service company recorded.{" "}
            <Link href={`/items/${itemId}/edit`}>Add one for this item</Link>
            {sub && (
              <>
                {" "}
                or <Link href={`/categories/${sub.id}/edit`}>for all {sub.name.toLowerCase()}</Link>
              </>
            )}
            .
          </p>
        )}

        {maker && maker.phone && maker.id !== callCompany?.id && <CompanyLine company={maker} why="the maker" />}

        <p className="text-sm" data-testid="contact-person">
          Staff contact for this kind of thing:{" "}
          {person ? (
            <>
              <strong>{person.full_name}</strong>
              {person.phone ? (
                <>
                  {" "}
                  · <a href={telLink(person.phone)}>{person.phone}</a>
                </>
              ) : (
                ""
              )}
            </>
          ) : (
            "nobody set yet"
          )}
          .
        </p>

        <div>
          <p className="font-semibold">Manuals and documents</p>
          {docs.length === 0 ? (
            <p className="text-sm text-icci-ink-60">None added yet.</p>
          ) : (
            <DocumentList docs={docs} canHide={false} />
          )}
        </div>

        <p className="text-sm text-icci-ink-60">
          {tickets.count ? `${tickets.count} maintenance ticket${tickets.count === 1 ? "" : "s"} so far for this item.` : "No maintenance tickets for this item before."}
        </p>
      </div>
    </Card>
  );
}
