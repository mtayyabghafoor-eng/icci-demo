// Style sample (slice UI-1, docs/UI-PLAN.md): every shared building block on
// one page, so the owner can review the new look from one screenshot before
// the screens are moved onto it. Signed-in only, not in the menu. All
// examples are made up.
import type { Metadata } from "next";
import Image from "next/image";
import {
  ClipboardCheck,
  Download,
  EyeOff,
  House,
  Inbox,
  MoveRight,
  Package,
  PackagePlus,
  Plus,
  Printer,
  ScanLine,
  ShieldCheck,
  Table2,
  TriangleAlert,
  Users,
  ChartColumn,
} from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  CardTitle,
  CounterCard,
  DataTable,
  EmptyState,
  FactGrid,
  Field,
  Input,
  LinkButton,
  Logo,
  Notice,
  PageHeader,
  Pagination,
  QuickAction,
  Select,
  Skeleton,
  StatusPill,
  Textarea,
  Timeline,
} from "@/components/ui";
import type { Tone } from "@/lib/items/rules";

export const metadata: Metadata = { title: "Style Sample | ICCI Control Dashboard" };

const SWATCHES = [
  { name: "Green 900", hex: "#002B23", light: false },
  { name: "Green 800", hex: "#004236", light: false },
  { name: "Green 600", hex: "#006B54", light: false },
  { name: "Green 100", hex: "#EAF2EF", light: true },
  { name: "Gold 500", hex: "#B8985A", light: false },
  { name: "Gold 300", hex: "#D9C9A3", light: true },
  { name: "Gold 100", hex: "#F4EEDF", light: true },
  { name: "Cream", hex: "#FAF8F3", light: true },
  { name: "Ink", hex: "#1F2A27", light: false },
  { name: "Red", hex: "#B3261E", light: false },
];

type Row = { label: string; name: string; place: string; word: string; tone: Tone };
const ROWS: Row[] = [
  { label: "ICCI-000151", name: "Test bin bags", place: "Test Building A › Test Store Room A1-1", word: "In stock", tone: "green" },
  { label: "ICCI-000207", name: "Test hand soap", place: "Test Building B › Test Shelf B1-1-1", word: "Low", tone: "amber" },
  { label: "ICCI-000075", name: "Test bookcase 07", place: "Test Building A › Test Room A1", word: "Missing", tone: "red" },
  { label: "ICCI-000214", name: "Test kettle 02", place: "Test Building B › Test Room B1", word: "Not counted yet", tone: "grey" },
];

const SIDE_LINKS = [
  { icon: House, label: "Home", active: true },
  { icon: Package, label: "Items" },
  { icon: ChartColumn, label: "Stock" },
  { icon: ScanLine, label: "Stocktake" },
  { icon: Users, label: "People" },
  { icon: ShieldCheck, label: "Garda vetting" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="page-title text-[28px]">{title}</h2>
      <div aria-hidden className="mb-5 mt-2 h-px w-12 bg-icci-gold" />
      {children}
    </section>
  );
}

export default function StyleSample() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8" data-testid="style-sample">
      <PageHeader
        title="Style Sample"
        crumbs={[{ href: "/", label: "Home" }, { label: "Style sample" }]}
        subtitle="The new look, part by part. Screens move onto these parts in the next slices. All examples are made up."
      />

      {/* Brand: the logo on dark green with the star pattern, and the Centre photograph. */}
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="icci-pattern relative overflow-hidden rounded-2xl bg-gradient-to-b from-icci-green-dark to-icci-green-900 p-5 text-white shadow-card" data-testid="sidebar-preview">
          <div className="flex items-center gap-3">
            <Logo size={56} priority />
            <div>
              <p className="page-title text-[26px] text-white!">ICCI</p>
              <p className="text-[13px] text-[#e9e1cf]">Control Dashboard</p>
            </div>
          </div>
          <p className="mt-6 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#d9c9a3]">Overview</p>
          <ul className="mt-2 flex flex-col gap-1">
            {SIDE_LINKS.map(({ icon: Icon, label, active }) => (
              <li
                key={label}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium ${active ? "relative bg-white/12 text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-icci-gold" : "text-white/80"}`}
              >
                <Icon aria-hidden size={19} strokeWidth={1.9} />
                {label}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4">
            <Avatar name="Test Centre Admin" />
            <div className="leading-tight">
              <p className="font-semibold">Test Centre Admin</p>
              <p className="text-[13px] text-white/70">Centre Admin</p>
            </div>
          </div>
        </div>

        <div className="relative min-h-72 overflow-hidden rounded-2xl shadow-card" data-testid="photo-preview">
          <Image src="/brand/centre-front-1800.webp" alt="The Islamic Cultural Centre of Ireland, Clonskeagh" fill sizes="(min-width: 1024px) 800px, 100vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-r from-icci-green-900/90 via-icci-green-dark/70 to-icci-green-dark/10" />
          <div className="relative flex h-full flex-col justify-end p-6 text-white md:p-8">
            <p className="text-sm font-semibold text-[#e9e1cf]">Sunday 15 November</p>
            <p className="page-title mt-1 text-[34px] text-white! md:text-[42px]">Good Evening, Test Admin</p>
            <p className="mt-2 max-w-md text-white/85">3 things need attention today. This strip sits behind the home-page greeting.</p>
          </div>
        </div>
      </div>

      <Section title="Colours">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SWATCHES.map((s) => (
            <li key={s.hex} className="overflow-hidden rounded-xl border border-icci-line bg-white">
              <div className="h-16" style={{ background: s.hex }} />
              <div className="px-3 py-2 text-sm">
                <p className="font-semibold">{s.name}</p>
                <p className="font-mono text-icci-ink-60">{s.hex}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-icci-ink-60">Gold is for lines and large titles only, never small text.</p>
      </Section>

      <Section title="Type">
        <Card>
          <p className="page-title text-[42px]">Move This Asset</p>
          <p className="mt-1 text-sm text-icci-ink-60">Titles: Cormorant Garamond, Title Case, 28 pixels and larger.</p>
          <p className="mt-5 text-lg font-bold">Section heading in Plus Jakarta Sans</p>
          <p className="mt-1 max-w-2xl">
            Body text in Plus Jakarta Sans. It stays clear at small sizes, and numbers line up in columns: 1,248 items, 26 low, 892 counted.
          </p>
          <p className="mt-4 font-mono text-lg">ICCI-000123</p>
          <p className="text-sm text-icci-ink-60">Label numbers and codes: JetBrains Mono.</p>
          <p className="mt-4" dir="auto">مكتبة المركز (Arabic in any field keeps working)</p>
        </Card>
      </Section>

      <Section title="Buttons and Status">
        <div className="flex flex-wrap gap-3">
          <Button icon={PackagePlus}>Register an item</Button>
          <Button kind="secondary" icon={ClipboardCheck}>Count this shelf</Button>
          <Button kind="outline" icon={Download}>Download CSV</Button>
          <Button kind="danger" icon={TriangleAlert}>Report damage</Button>
          <Button kind="ghost">Cancel</Button>
          <LinkButton href="/style" kind="primary" size="lg" iconAfter={MoveRight}>Move</LinkButton>
          <Button disabled>Not available</Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <StatusPill tone="green">In stock</StatusPill>
          <StatusPill tone="green">Valid</StatusPill>
          <StatusPill tone="amber">Low</StatusPill>
          <StatusPill tone="amber">Due soon</StatusPill>
          <StatusPill tone="red">Missing</StatusPill>
          <StatusPill tone="red">Expired</StatusPill>
          <StatusPill tone="grey">Not counted yet</StatusPill>
        </div>
      </Section>

      <Section title="Home Page Parts">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CounterCard href="/style" icon={TriangleAlert} title="Missing or damaged" count={24} detail="Assets to look into" tone="red" />
          <CounterCard href="/style" icon={ChartColumn} title="Low stock" count={7} detail="Shelves running low" tone="amber" />
          <CounterCard href="/style" icon={ShieldCheck} title="Vetting due" count={3} detail="Within 30 days" tone="amber" />
          <CounterCard href="/style" icon={EyeOff} title="Not seen in 12 months" count={0} detail="Every asset seen" tone="green" />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardTitle>Quick actions</CardTitle>
            <div className="flex flex-col">
              <QuickAction href="/style" icon={PackagePlus} label="Register an item" hint="Scan a new label and add details" />
              <QuickAction href="/style" icon={ClipboardCheck} label="Count a shelf" hint="Weekly count of a store room" />
              <QuickAction href="/style" icon={MoveRight} label="Move an asset" />
              <QuickAction href="/style" icon={Printer} label="Print labels" />
            </div>
          </Card>
          <Card>
            <CardTitle>History</CardTitle>
            <Timeline
              entries={[
                { key: "1", when: "15 Nov 2026, 10:24", title: "Moved to Test Room B1", detail: "By Test Centre Admin · reported by Test caretaker (fictional)", tone: "green" },
                { key: "2", when: "2 Nov 2026, 16:05", title: "Reported damaged", detail: "Leg loose. By Test Centre Admin", tone: "red" },
                { key: "3", when: "14 Oct 2026, 09:12", title: "Registered", detail: "Label ICCI-000075 · Test Building A", tone: "grey" },
              ]}
            />
          </Card>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <form className="flex flex-col gap-5">
              <Field id="s-place" label="Where is it going?">
                <Select id="s-place" defaultValue="b1">
                  <option value="a1">Test Building A › Test Room A1</option>
                  <option value="b1">Test Building B › Test Room B1</option>
                </Select>
              </Field>
              <Field id="s-note" label="Note" optional help="A few words on why, for the history.">
                <Textarea id="s-note" defaultValue="Test move: needed for the made-up open day" />
              </Field>
              <Field id="s-name" label="Their name" error="Type the name of the person who reported it.">
                <Input id="s-name" invalid aria-describedby="s-name-error" />
              </Field>
              <div className="flex justify-end gap-3">
                <Button kind="ghost">Cancel</Button>
                <Button iconAfter={MoveRight}>Move</Button>
              </div>
            </form>
          </Card>
          <Card>
            <CardTitle action={<StatusPill tone="green">Good</StatusPill>}>Details</CardTitle>
            <FactGrid
              facts={[
                { label: "Label", value: <span className="font-mono">ICCI-000075</span> },
                { label: "Kind", value: "Fixed asset" },
                { label: "Category", value: "Furniture" },
                { label: "Place", value: "Test Building A › Test Room A1" },
                { label: "Last seen", value: "15 Nov 2026" },
                { label: "Added", value: "14 Oct 2026" },
              ]}
            />
          </Card>
        </div>
      </Section>

      <Section title="Messages">
        <div className="grid gap-3 lg:grid-cols-2">
          <Notice tone="success" title="Vetting recorded.">It now shows on the person&apos;s page.</Notice>
          <Notice tone="info">Only the status and dates are kept, never the disclosure itself.</Notice>
          <Notice tone="warning" title="Two warnings before publishing">Test Volunteer is on twice on Friday.</Notice>
          <Notice tone="error" title="That code did not work.">Check the authenticator app and try the new code.</Notice>
        </div>
      </Section>

      <Section title="Lists">
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-icci-line bg-white p-3 shadow-card">
          <div className="min-w-56 flex-1">
            <Input aria-label="Search" placeholder="Search by name or label number" />
          </div>
          <Select aria-label="Kind" className="w-auto!">
            <option>All kinds</option>
          </Select>
          <Button kind="outline" icon={Download}>CSV</Button>
          <Button icon={Plus}>Register</Button>
        </div>
        <DataTable
          caption="Example list of made-up items"
          rows={ROWS}
          rowKey={(r) => r.label}
          columns={[
            { key: "label", header: "Label", cell: (r) => <span className="font-mono text-sm">{r.label}</span> },
            {
              key: "name",
              header: "Name",
              cell: (r) => (
                <>
                  <a href="/style" className="font-semibold no-underline hover:underline">{r.name}</a>
                  <span className="block text-sm text-icci-ink-60 md:hidden">{r.place}</span>
                </>
              ),
            },
            { key: "place", header: "Place", wideOnly: true, cell: (r) => <span className="text-sm text-icci-ink-60">{r.place}</span> },
            { key: "status", header: "Status", align: "right", cell: (r) => <StatusPill tone={r.tone}>{r.word}</StatusPill> },
          ]}
        />
        <Pagination page={1} size={50} total={487} hrefFor={() => "/style"} />
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <EmptyState icon={Inbox} title="No items match" action={<Button kind="outline">Clear the filters</Button>}>
            Try fewer filters, or register a new item.
          </EmptyState>
          <Card>
            <CardTitle>Loading</CardTitle>
            <Skeleton lines={4} label="Loading example" />
          </Card>
        </div>
      </Section>

      <Section title="Icons">
        <ul className="flex flex-wrap gap-3">
          {[
            [House, "Home"],
            [Package, "Items"],
            [PackagePlus, "Register"],
            [ChartColumn, "Stock"],
            [ClipboardCheck, "Count"],
            [TriangleAlert, "Missing and damaged"],
            [EyeOff, "Not seen"],
            [Table2, "Asset register"],
            [ScanLine, "Stocktake"],
            [Users, "People"],
            [ShieldCheck, "Vetting"],
            [Printer, "Labels"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof House;
            return (
              <li key={label as string} className="flex items-center gap-2 rounded-xl border border-icci-line bg-white px-3 py-2 text-sm font-medium">
                <I aria-hidden size={18} className="text-icci-green" />
                {label as string}
              </li>
            );
          })}
        </ul>
      </Section>
    </main>
  );
}
