// The frame every signed-in page sits in: the page width, and a "Loading…"
// line while its data is read (the app uses Next.js "cache components",
// so anything read from the database must be inside <Suspense>).
import { Suspense, type ReactNode } from "react";
import { cx } from "@/lib/ui/text";

const WIDTH = { narrow: "max-w-xl", medium: "max-w-4xl", wide: "max-w-5xl md:px-8 md:py-8" } as const;

export function PageShell({ width = "medium", loading = "Loading…", children }: { width?: keyof typeof WIDTH; loading?: string; children: ReactNode }) {
  return (
    <main className={cx("mx-auto w-full flex-1 px-4 py-6", WIDTH[width])}>
      <Suspense fallback={<p>{loading}</p>}>{children}</Suspense>
    </main>
  );
}
