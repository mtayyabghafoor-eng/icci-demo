// Slice P4.3: looking a book up from its ISBN on Open Library. The answers
// below are made up, in the shape Open Library uses (checked once against
// the real service on 19 Nov 2026). Only the ISBN may ever be sent.
import { describe, expect, it } from "vitest";
import { isbnFromBarcode, lookupIsbn, openLibraryBase, readOpenLibraryAnswer } from "@/lib/library/lookup";

const ISBN = "9799900000005";

const found = {
  [`ISBN:${ISBN}`]: {
    title: "The Patient Gardener",
    subtitle: "A Made-Up Story",
    authors: [{ name: "Test Author One", url: "https://example.test/a1" }, { name: "Test Author Two" }],
    publishers: [{ name: "Test Press (made up)" }, { name: "Second Test Press" }],
    publish_date: "October 1, 1998",
    number_of_pages: 96,
  },
};

describe("reading Open Library's answer", () => {
  it("a book found: title with subtitle, authors, first publisher, year", () => {
    expect(readOpenLibraryAnswer(found, ISBN)).toEqual({
      title: "The Patient Gardener: A Made-Up Story",
      author: "Test Author One, Test Author Two",
      publisher: "Test Press (made up)",
      year: 1998,
    });
  });

  it("missing details are left empty", () => {
    expect(readOpenLibraryAnswer({ [`ISBN:${ISBN}`]: { title: "Only A Title" } }, ISBN)).toEqual({
      title: "Only A Title",
      author: null,
      publisher: null,
      year: null,
    });
  });

  it("a year is found in any date wording", () => {
    for (const [date, year] of [["1998", 1998], ["March 2004", 2004], ["2011-05-02", 2011], ["c1987", 1987], ["undated", null]] as const) {
      const r = readOpenLibraryAnswer({ [`ISBN:${ISBN}`]: { title: "T", publish_date: date } }, ISBN);
      expect(r?.year, date).toBe(year);
    }
  });

  it("nothing found: the empty answer", () => {
    expect(readOpenLibraryAnswer({}, ISBN)).toBeNull();
  });

  it("an answer about another ISBN, a missing title or a strange shape counts as nothing found", () => {
    expect(readOpenLibraryAnswer({ "ISBN:9780000000002": { title: "Other" } }, ISBN)).toBeNull();
    expect(readOpenLibraryAnswer({ [`ISBN:${ISBN}`]: { authors: [{ name: "x" }] } }, ISBN)).toBeNull();
    for (const odd of [null, "text", 42, [], { [`ISBN:${ISBN}`]: "text" }, { [`ISBN:${ISBN}`]: { title: 5 } }]) {
      expect(readOpenLibraryAnswer(odd, ISBN)).toBeNull();
    }
  });

  it("very long details are cut to what the library keeps", () => {
    const r = readOpenLibraryAnswer(
      { [`ISBN:${ISBN}`]: { title: "x".repeat(500), authors: [{ name: "y".repeat(300) }], publishers: [{ name: "z".repeat(300) }] } },
      ISBN,
    );
    expect(r?.title.length).toBe(300);
    expect(r?.author?.length).toBe(200);
    expect(r?.publisher?.length).toBe(200);
  });

  it("spaces are tidied", () => {
    const r = readOpenLibraryAnswer({ [`ISBN:${ISBN}`]: { title: "  The   Title  ", authors: [{ name: " A  B " }] } }, ISBN);
    expect(r).toMatchObject({ title: "The Title", author: "A B" });
  });
});

type Call = { url: string; init?: RequestInit };

function fakeFetch(reply: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return reply(call);
  };
  return { fn: fn as typeof fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("asking Open Library", () => {
  it("sends only the ISBN, to the books address, and reads the answer", async () => {
    const f = fakeFetch(() => json(found));
    const r = await lookupIsbn(ISBN, { fetchFn: f.fn, baseUrl: "https://openlibrary.org" });
    expect(r).toEqual({ status: "found", details: readOpenLibraryAnswer(found, ISBN) });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(`https://openlibrary.org/api/books?bibkeys=ISBN:${ISBN}&jscmd=data&format=json`);
    // No cookies, no names, no contact details: a plain request naming the app.
    const headers = new Headers(f.calls[0].init?.headers);
    expect([...headers.keys()].sort()).toEqual(["accept", "user-agent"]);
    expect(headers.get("user-agent")).toMatch(/^ICCI-Control-Dashboard/);
    expect(headers.get("user-agent")).not.toMatch(/@/);
    expect(f.calls[0].init?.credentials).toBe("omit");
  });

  it("nothing found", async () => {
    const f = fakeFetch(() => json({}));
    expect(await lookupIsbn(ISBN, { fetchFn: f.fn, baseUrl: "https://openlibrary.org" })).toEqual({ status: "not_found" });
  });

  it("the service down, refusing or answering nonsense: unavailable", async () => {
    for (const reply of [() => json({}, 500), () => json({}, 429), () => new Response("<html>", { status: 200 }), () => Promise.reject(new Error("network"))]) {
      const f = fakeFetch(reply);
      expect(await lookupIsbn(ISBN, { fetchFn: f.fn, baseUrl: "https://openlibrary.org" })).toEqual({ status: "unavailable" });
    }
  });

  it("gives up after the time limit (5 seconds normally)", async () => {
    const f = fakeFetch(
      (call) =>
        new Promise<Response>((_, reject) => {
          call.init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const started = Date.now();
    expect(await lookupIsbn(ISBN, { fetchFn: f.fn, baseUrl: "https://openlibrary.org", timeoutMs: 50 })).toEqual({ status: "unavailable" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("never sends anything that is not a correct 13-digit ISBN", async () => {
    const f = fakeFetch(() => json(found));
    for (const bad of ["", "9799900000003", "hello", "9799900000005&x=1", "ISBN 979"]) {
      expect(await lookupIsbn(bad, { fetchFn: f.fn, baseUrl: "https://openlibrary.org" })).toEqual({ status: "not_found" });
    }
    expect(f.calls).toHaveLength(0);
  });
});

describe("where the look-up goes", () => {
  it("Open Library unless a test or the owner sets another web address", () => {
    expect(openLibraryBase(undefined)).toBe("https://openlibrary.org");
    expect(openLibraryBase("")).toBe("https://openlibrary.org");
    expect(openLibraryBase("http://localhost:3999")).toBe("http://localhost:3999");
    expect(openLibraryBase("http://localhost:3999/")).toBe("http://localhost:3999");
  });

  it("ignores anything that is not a plain web address", () => {
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "not a url", "ftp://example.test"]) {
      expect(openLibraryBase(bad), bad).toBe("https://openlibrary.org");
    }
  });
});

describe("a barcode read by the camera", () => {
  it("is used only when it is a book's ISBN (978 or 979, correct check digit)", () => {
    expect(isbnFromBarcode(ISBN)).toBe(ISBN);
    expect(isbnFromBarcode(" 9799900000005 ")).toBe(ISBN);
    expect(isbnFromBarcode("9799900000003")).toBeNull();
    // A shop barcode on a box (not a book) is not an ISBN.
    expect(isbnFromBarcode("5012345678900")).toBeNull();
    expect(isbnFromBarcode("https://icci.test/l/ICCI-000001")).toBeNull();
    expect(isbnFromBarcode("")).toBeNull();
  });
});
