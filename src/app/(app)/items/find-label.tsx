// Type a label number instead of scanning it.
export function FindLabel() {
  return (
    <form action="/l" method="get" className="flex gap-2" role="search" aria-label="Find a label">
      <label className="flex-1">
        <span className="sr-only">Label number</span>
        <input
          name="number"
          required
          placeholder="e.g. ICCI-000123"
          className="block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green"
        />
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 py-2 font-semibold text-icci-green! no-underline transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50"
      >
        Open label
      </button>
    </form>
  );
}
