const defaultWait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Minimal Google API HTTP adapter with injected fetch/wait dependencies.
 * It is intentionally network-agnostic so tests can exercise retries without
 * Google credentials, Deno runtime, or a live spreadsheet.
 */
/** @param {string} url @param {string} token @param {{method?: string, body?: unknown, retryable?: boolean, fetchImpl?: typeof fetch, wait?: (ms: number) => Promise<void>} } options */
export async function requestGoogleApi(url, token, {
  method = 'GET',
  body,
  retryable = true,
  fetchImpl = globalThis.fetch,
  wait = defaultWait
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  if (typeof wait !== 'function') throw new TypeError('wait must be a function.');
  for (let attempt = 0; attempt < (retryable ? 3 : 1); attempt++) {
    try {
      const response = await fetchImpl(url, {
        method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (response.ok) return response.status === 204 ? {} : await response.json();
      const error = new Error('Google Sheets API returned HTTP ' + response.status + '.');
      error.status = response.status;
      if (retryable && (response.status === 429 || response.status >= 500) && attempt < 2) {
        await wait(250 * (attempt + 1));
        continue;
      }
      throw error;
    } catch (error) {
      const status = error?.status;
      if (retryable && (!status || status === 429 || status >= 500) && attempt < 2) {
        await wait(250 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Google Sheets API retry limit reached.');
}
