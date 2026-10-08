export type ApiErrorKind = "http" | "network" | "timeout" | "aborted" | "contract";

/** Typed transport error. Schema failures are `ContractError` (types/schemas.ts). */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const j: unknown = await res.json();
    if (j && typeof j === "object" && "detail" in j) {
      const d = (j as { detail: unknown }).detail;
      return typeof d === "string" ? d : JSON.stringify(d);
    }
  } catch {
    /* fall through */
  }
  return `HTTP ${res.status}`;
}

export async function requestJson(path: string, o: RequestOptions = {}): Promise<unknown> {
  const { method = "GET", body, signal, timeoutMs = 30000, baseUrl = "" } = o;
  if (signal?.aborted) throw new ApiError("aborted", "Request cancelled");
  const ctl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  try {
    const res = await fetch(baseUrl + path, {
      method,
      signal: ctl.signal,
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError("http", await errorDetail(res), res.status);
    try {
      return await res.json();
    } catch (e) {
      if (timedOut || signal?.aborted) throw e;
      throw new ApiError("contract", "Response was not valid JSON");
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (timedOut) throw new ApiError("timeout", `Request timed out after ${timeoutMs} ms`);
    if (signal?.aborted) throw new ApiError("aborted", "Request cancelled");
    throw new ApiError("network", e instanceof Error ? e.message : "Network error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}