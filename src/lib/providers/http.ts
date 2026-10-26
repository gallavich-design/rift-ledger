// Small fetch helper with timeout + exponential backoff on 429/5xx (spec §2 "respect rate limits").

export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function fetchJson(url: string, init: RequestInit = {}, retries = 4): Promise<unknown> {
  let delay = 500;
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: { Accept: "application/json", "User-Agent": "RiftLedger/0.1", ...init.headers },
      });
      if (res.ok) return await res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) {
        throw new ProviderError(`${res.status} ${res.statusText} for ${url}`, res.status);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (attempt >= retries) throw new ProviderError(`Network error for ${url}: ${(err as Error).message}`);
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
    delay *= 2;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
