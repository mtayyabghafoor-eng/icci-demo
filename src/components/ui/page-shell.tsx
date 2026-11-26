// The frame every signed-in page sits in: one of three page widths (Round
// C1: narrow for forms, medium for one record, wide for lists), and grey
// loading bars while its data is read (the app uses Next.js "cache components",
// so anything read from the database must be inside <Suspense>).
import { Suspense, type ReactNode } from "react";
import { cx } from "@/lib/ui/text";
import { Skeleton } from "./feedback";

const WIDTH = { narrow: "max-w-xl", medium: "max-w-4xl", wide: "max-w-6xl" } as const;

export function PageShell({ width = "medium", loading = "Loading", children }: { width?: keyof typeof WIDTH; loading?: string; children: ReactNode }) {
  return (
    <main className={cx("mx-auto w-full flex-1 px-4 py-6", WIDTH[width])}>
      <Suspense fallback={<Skeleton label={loading} />}>{children}</Suspense>
    </main>
  );
}
