"use client";
// D8 (owner, 27 Nov 2026): one search box for items, people, policies,
// books, companies, places and vehicles. As you type, a short list drops
// down, grouped by kind; the arrow keys move through it and Enter opens the
// one chosen. Enter on its own opens the full results page, or, for a label
// number such as 123 or a place code such as PL-0007, that label at once.
// Press "/" anywhere to jump to the box.
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SearchAnswer } from "@/lib/search/everything";
import { jumpFor } from "@/lib/search/jump";
import { cx } from "@/lib/ui/text";

type Option = { id: string; href: string; title: string; detail: string | null; group: string | null };

export function GlobalSearch({ placeholder, big = false, slashKey = false }: { placeholder: string; big?: boolean; slashKey?: boolean }) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);

  // Ask the server a moment after typing stops; an older question is dropped.
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) return;
    const stop = new AbortController();
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/search/suggest?q=${encodeURIComponent(q)}`, { signal: stop.signal, cache: "no-store" });
        if (r.ok) {
          setAnswer((await r.json()) as SearchAnswer);
          setActive(-1);
        }
      } catch {
        // Typing again (or leaving the page) stopped this question.
      } finally {
        if (!stop.signal.aborted) setBusy(false);
      }
    }, 180);
    return () => {
      stop.abort();
      window.clearTimeout(t);
    };
  }, [text]);

  useEffect(() => {
    if (!slashKey) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [slashKey]);

  const q = text.trim();
  const shown = q.length >= 2 ? answer : null;
  const options = useMemo<Option[]>(() => {
    if (!q) return [];
    const out: Option[] = [];
    const jump = jumpFor(q);
    if (jump) out.push({ id: `${id}-jump`, href: jump.href, title: jump.text, detail: null, group: null });
    for (const g of shown?.groups ?? []) g.hits.forEach((h, i) => out.push({ id: `${id}-${g.key}-${i}`, ...h, group: g.title }));
    if (q.length >= 2) out.push({ id: `${id}-all`, href: `/search?q=${encodeURIComponent(q)}`, title: `See all results for “${q}”`, detail: null, group: null });
    return out;
  }, [shown, q, id]);
  const listOpen = open && options.length > 0 && (q.length >= 2 || !!jumpFor(q));

  const openHref = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const submit = () => {
    if (!q) return;
    if (active >= 0 && options[active]) return openHref(options[active].href);
    // A label number or place code opens straight away, as before.
    const jump = jumpFor(q);
    if (jump) return openHref(jump.href);
    openHref(`/search?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      // Goes round: nothing chosen (-1), the first line … the last line, nothing again.
      const n = options.length + 1;
      setActive((a) => ((((a + 1 + step) % n) + n) % n) - 1);
    } else if (e.key === "Escape") {
      if (listOpen) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  };
  // Keep the chosen line in range: -1 means "nothing chosen yet".
  const chosen = active >= options.length ? -1 : active;

  // Lines, with a small heading at the start of each kind.
  let lastGroup: string | null | undefined;
  const list = options.map((o, i) => {
    const heading = o.group && o.group !== lastGroup ? o.group : null;
    lastGroup = o.group;
    return (
      <li key={o.id} role="presentation">
        {heading && (
          <p aria-hidden className="px-3 pt-3 pb-1 text-sm font-semibold text-icci-ink-60">
            {heading}
          </p>
        )}
        <a
          id={o.id}
          role="option"
          aria-selected={i === chosen}
          aria-label={o.group ? `${o.title}, ${o.group}${o.detail ? `, ${o.detail}` : ""}` : o.title}
          href={o.href}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            openHref(o.href);
          }}
          onMouseEnter={() => setActive(i)}
          className={cx(
            "flex min-h-11 flex-col justify-center rounded-lg px-3 py-1.5 no-underline",
            i === chosen ? "bg-icci-green-50" : "hover:bg-icci-green-50",
            !o.group && "font-semibold text-icci-green",
          )}
        >
          <span dir="auto" className={cx("truncate", o.group && "text-icci-ink")}>{o.title}</span>
          {o.detail && <span className="truncate text-sm text-icci-ink-60">{o.detail}</span>}
        </a>
      </li>
    );
  });

  return (
    <form
      action="/search"
      method="get"
      role="search"
      aria-label="Search the dashboard"
      className={cx("relative", big ? "w-full" : "w-[min(26rem,36vw)]")}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={`${id}-box`} className="sr-only">
        Search items, people, policies, books and labels
      </label>
      <Search aria-hidden size={big ? 20 : 18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-icci-ink-60" />
      <input
        ref={input}
        id={`${id}-box`}
        name="q"
        type="search"
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={listOpen && chosen >= 0 ? options[chosen]?.id : undefined}
        autoComplete="off"
        enterKeyHint="search"
        data-testid={big ? "search-box-big" : "search-box"}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className={cx(
          "w-full rounded-xl border border-icci-field bg-white pr-10 pl-10 placeholder:text-icci-ink-60/80 focus:border-icci-green",
          big ? "h-13 text-base shadow-sm" : "h-10 text-sm",
        )}
      />
      {slashKey && !text && (
        <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-icci-line px-1.5 text-xs text-icci-ink-60 lg:block">
          /
        </kbd>
      )}
      {busy && <span className="sr-only" role="status">Searching…</span>}
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="Results"
        data-testid="search-results"
        hidden={!listOpen}
        className="absolute top-full right-0 left-0 z-30 mt-1.5 max-h-[70vh] overflow-auto rounded-xl border border-icci-line bg-white p-1.5 shadow-raised"
      >
        {list}
        {shown && shown.groups.length === 0 && !shown.jump && (
          <li role="presentation" className="px-3 py-2 text-sm text-icci-ink-60">
            Nothing found yet. Try a shorter word.
          </li>
        )}
      </ul>
    </form>
  );
}
