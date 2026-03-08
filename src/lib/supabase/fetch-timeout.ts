/**
 * Shared fetch wrapper for Supabase clients.
 *
 * Aborts requests that take longer than SUPABASE_FETCH_TIMEOUT_MS to
 * prevent server-side hangs when the Supabase endpoint is unreachable
 * (e.g. in CI with stub environment variables).
 */

export const SUPABASE_FETCH_TIMEOUT_MS = 8_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(
    () => controller.abort(),
    SUPABASE_FETCH_TIMEOUT_MS,
  );
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(id),
  );
}
