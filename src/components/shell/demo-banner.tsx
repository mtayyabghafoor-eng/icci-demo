import { showDemoBanner } from "@/lib/env";

// A slim strip on every page of the online demo (ICCI Staging), so nobody
// watching a presentation mistakes the realistic-looking names for real
// records (owner's choice, 19 Nov 2026). Not shown on development or
// production. Read on the server, so the setting never reaches the browser.
export function DemoBanner() {
  if (!showDemoBanner(process.env.ICCI_ENVIRONMENT)) return null;
  return (
    <p
      role="note"
      data-testid="demo-banner"
      className="bg-icci-gold-100 px-4 py-1.5 text-center text-[13px] font-semibold text-icci-text print:hidden"
    >
      Demo: all names and records are made up
    </p>
  );
}
