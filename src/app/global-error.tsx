"use client";
// Slice A6: the last safety net, when even the page frame failed. It has
// to draw its own page, so it keeps to plain colours written here (the
// site's style sheet may not be there). "Try again" fetches it again.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#faf8f3", color: "#1f2a27", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong | ICCI Control Dashboard</title>
        <main style={{ maxWidth: 420, margin: "15vh auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ color: "#004236", fontFamily: "Georgia, serif", fontWeight: 600 }}>Something Went Wrong</h1>
          <p>The dashboard could not be loaded just now, usually for a moment only. Nothing has been changed.</p>
          <p style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: 0, background: "#004236", color: "#fff", fontWeight: 600, fontSize: 15 }}
            >
              Try again
            </button>
            {/* A full page load on purpose: it starts the app afresh after an error. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: "1px solid #006b54", color: "#006b54", fontWeight: 600, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
            >
              Go to Home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
