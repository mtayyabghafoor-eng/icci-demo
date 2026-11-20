// UI-9: while a page is fetched, grey shapes in the form of a page (a
// title, a row of cards, a table) pulse gently instead of a blank screen.
// The words "Loading the page…" are read out by screen readers, and the
// browser tests wait for them to go.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8" aria-busy="true">
      <div role="status" aria-label="Loading the page" className="flex flex-col gap-6">
        <span className="sr-only">Loading the page…</span>
        <div className="flex flex-col gap-3">
          <div className="h-9 w-64 max-w-full animate-pulse rounded-xl bg-icci-panel" />
          <div className="h-5 w-96 max-w-full animate-pulse rounded-lg bg-icci-panel/70" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-icci-line bg-white p-5">
              <div className="h-8 w-16 rounded-lg bg-icci-panel" />
              <div className="mt-4 h-4 w-28 rounded bg-icci-panel/70" />
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-icci-line bg-white">
          <div className="h-11 bg-icci-green-50" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 border-t border-icci-line px-4 py-4">
              <div className="h-4 animate-pulse rounded bg-icci-panel" style={{ width: `${38 - (i % 3) * 6}%` }} />
              <div className="h-4 w-1/5 animate-pulse rounded bg-icci-panel/70" />
              <div className="ml-auto h-6 w-20 animate-pulse rounded-full bg-icci-panel/70" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
