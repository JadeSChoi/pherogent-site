/**
 * The owner access key for paid AI routes (issue #25). The key lives only
 * in sessionStorage — never in the workspace object, so backup exports can
 * never contain it — and leaves the browser only as an Authorization
 * header on same-origin API calls, attached by apiFetch below. Every paid
 * route must go through apiFetch so later surfaces (#12, #13, #14) inherit
 * the header for free. Closing the tab clears the key.
 */

const STORAGE_KEY = "pherogent-owner-key";

/** The saved key, or null when none is saved or storage is unavailable. */
export function readOwnerKey(): string | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/** Saves the key for this tab. A blank key is a clear, not a save. */
export function saveOwnerKey(key: string): void {
  try {
    if (key.trim()) sessionStorage.setItem(STORAGE_KEY, key.trim());
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage the key simply isn't kept; nothing else may break.
  }
}

/** Forgets the key; the deployment returns to its gated state. */
export function clearOwnerKey(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

/**
 * The one fetch for paid API routes: the saved owner key rides along as an
 * Authorization header when present, and nowhere else — never in a URL or
 * body. Reads the key per call, so saving or forgetting it applies to the
 * very next request.
 */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const key = readOwnerKey();
  if (!key) return fetch(input, init);
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      authorization: `Bearer ${key}`,
    },
  });
}
