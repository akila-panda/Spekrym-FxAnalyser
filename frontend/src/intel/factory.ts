/** F0 — IntelligenceSource factory. Mock by default; `api` is reserved (a real source is a later
 *  phase) and falls back to the mock, labelled "sample". Mirrors api/sourceFactory + deskSourceFactory. */
import { createMockIntelligenceSource } from "./mockSource";
import type { IntelligenceSource } from "./mockSource";

interface Env {
  VITE_DATA_SOURCE?: string;
}

export function createIntelligenceSource(env: Env = {}): IntelligenceSource {
  // "api" reserved: not built yet -> mock, labelled sample.
  void env.VITE_DATA_SOURCE;
  return createMockIntelligenceSource();
}

let singleton: IntelligenceSource | null = null;
export function getIntelligenceSource(): IntelligenceSource {
  singleton ??= createIntelligenceSource({ VITE_DATA_SOURCE: readEnv() });
  return singleton;
}

function readEnv(): string | undefined {
  try {
    return (import.meta as unknown as { env?: { VITE_DATA_SOURCE?: string } }).env?.VITE_DATA_SOURCE;
  } catch {
    return undefined;
  }
}
