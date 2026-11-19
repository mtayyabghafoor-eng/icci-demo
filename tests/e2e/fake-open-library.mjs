// A pretend Open Library for the browser tests (slice P4.3). It runs only on
// this computer, answers in the same shape as the real service (checked on
// 19 Nov 2026), and knows only made-up books. The website is pointed at it
// with OPEN_LIBRARY_URL (playwright.config.ts), so tests never depend on, or
// send anything to, a real outside website. What it does depends on how the
// made-up ISBN starts, so every test can use a fresh number:
//   97999001...  -> found: a made-up book (title, subtitle, author, publisher, date)
//   97999002...  -> answers after 8 seconds (the website gives up after 5)
//   anything else -> nothing found
import { createServer } from "node:http";

export const FAKE_OPEN_LIBRARY_PORT = 3999;
export const FAKE_PREFIX = { FOUND: "97999001", SLOW: "97999002", NOT_FOUND: "97999003" };

export const FAKE_BOOK = {
  title: "The Patient Gardener",
  subtitle: "A Made-Up Story",
  authors: [{ name: "Test Author Looked-Up" }],
  publishers: [{ name: "Test Press (made up)" }],
  publish_date: "October 1, 1998",
};

export function startFakeOpenLibrary(port = FAKE_OPEN_LIBRARY_PORT) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/books") {
      res.writeHead(404).end();
      return;
    }
    const isbn = (url.searchParams.get("bibkeys") ?? "").replace(/^ISBN:/, "");
    const reply = () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(isbn.startsWith(FAKE_PREFIX.FOUND) ? { [`ISBN:${isbn}`]: FAKE_BOOK } : {}));
    };
    if (isbn.startsWith(FAKE_PREFIX.SLOW)) setTimeout(reply, 8000);
    else reply();
  });
  server.listen(port, "127.0.0.1");
  return server;
}

// Started by Playwright as its own little server: node tests/e2e/fake-open-library.mjs
if (process.argv[1] && process.argv[1].endsWith("fake-open-library.mjs")) {
  startFakeOpenLibrary();
  console.log(`Pretend Open Library on http://127.0.0.1:${FAKE_OPEN_LIBRARY_PORT}`);
}
