// Windows sometimes locks a file for a moment (virus scanner, search
// indexer, a picture viewer), and saving a screenshot over it then fails
// with "UNKNOWN", "EBUSY", "EPERM" or "EACCES". That says nothing about the
// app, so the screenshot helper tries again: three tries in all, half a
// second apart. Any other error fails straight away.

const LOCK_CODES = new Set(["UNKNOWN", "EBUSY", "EPERM", "EACCES"]);

export function isFileLock(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  if (code && LOCK_CODES.has(code)) return true;
  return /\b(UNKNOWN: unknown error, open|EBUSY|EPERM|EACCES)\b/.test(error.message);
}

export async function withFileLockRetry<T>(save: () => Promise<T>, waitMs = 500, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await save();
    } catch (error) {
      if (attempt >= attempts || !isFileLock(error)) throw error;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
