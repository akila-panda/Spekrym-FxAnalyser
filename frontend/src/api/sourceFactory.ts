import type { DataSource } from "./dataSource";
import { createHttpSource } from "./httpSource";
import { createMockSource } from "./mock/mockSource";

interface Env {
  VITE_DATA_SOURCE?: string;
  VITE_API_BASE?: string;
}

/** `VITE_DATA_SOURCE` = `mock` (default) or `api`. */
export function createDataSource(env: Env = import.meta.env): DataSource {
  const kind = env.VITE_DATA_SOURCE ?? "mock";
  if (kind === "mock") return createMockSource();
  if (kind === "api") return createHttpSource(env.VITE_API_BASE ?? "");
  throw new Error(`VITE_DATA_SOURCE must be "mock" or "api", got "${kind}"`);
}

let shared: DataSource | undefined;
export function getDataSource(): DataSource {
  shared ??= createDataSource();
  return shared;
}