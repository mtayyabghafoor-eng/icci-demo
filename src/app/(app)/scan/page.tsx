// "Scan" on the phone bottom bar (docs/UI-PLAN.md 4.3). Labels are scanned
// with the phone's own camera app, which opens the label's page here. A
// phone whose browser can read QR codes also gets a scanner here (slice
// UI-7); every phone gets the Camera-app steps and the type-the-number box.
import type { Metadata } from "next";
import { Camera, QrCode } from "lucide-react";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayScan } from "@/lib/ui/menu";
import { CameraScanner } from "@/components/shell/camera-scanner";
import { FindLabel } from "../items/find-label";

export const metadata: Metadata = { title: "Open a Label | ICCI Control Dashboard" };

export default function ScanPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 md:py-10">
      <PageHeader title="Open a Label" subtitle="Scan the QR code on an ICCI label, or type its number." />
      {/* The role check waits for the sign-in; the heading shows straight away. */}
      <Suspense fallback={<Skeleton lines={3} label="Loading" />}>
        <Choices />
      </Suspense>
    </main>
  );
}

async function Choices() {
  const me = await requireAdmin();
  const allowed = mayScan(me.roleCode);
  return allowed ? (
    <div className="flex flex-col gap-5">
      <CameraScanner />
      <Card>
        <div className="flex gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-icci-gold-300 bg-icci-gold-100 text-icci-green-dark">
            <Camera aria-hidden size={24} />
          </span>
          <div>
            <h2 className="text-lg font-bold">With the phone&apos;s Camera app</h2>
            <ol className="mt-2 list-decimal pl-5 text-[15px] leading-relaxed">
              <li>Open the phone&apos;s Camera app.</li>
              <li>Point it at the square code on the label.</li>
              <li>Tap the link that appears. The item or book opens here.</li>
            </ol>
          </div>
        </div>
      </Card>
          <Card>
            <div className="mb-4 flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-icci-gold-300 bg-icci-gold-100 text-icci-green-dark">
                <QrCode aria-hidden size={24} />
              </span>
              <h2 className="text-lg font-bold">Or type the number</h2>
            </div>
            <FindLabel />
          </Card>
        </div>
  ) : (
    <p className="rounded-2xl bg-icci-panel p-6" data-testid="cannot-scan">
      Your role does not open item labels.
    </p>
  );
}
