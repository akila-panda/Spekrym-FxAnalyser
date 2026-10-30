/** DESK DK0 — DeskSource factory. Mock by default; real `api` wiring is a later phase (the backend
 *  would supply candles/events; detectors still run client-side). Mirrors api/sourceFactory's env style. */
import { createMockDeskSource } from "./mockDeskSource";
import type { DeskScenario, DeskSource } from "./deskSource";

interface Env {
  VITE_DATA_SOURCE?: string;
  scenario?: DeskScenario;
}

export function createDeskSource(env: Env = {}): DeskSource {
  const kind = env.VITE_DATA_SOURCE ?? "mock";
  if (kind === "mock") return createMockDeskSource({ scenario: env.scenario ?? null });
  // "api" is reserved: a real DeskSource is not built yet. Fall back to mock, labelled sample.
  return createMockDeskSource({ scenario: env.scenario ?? null });
}

let singleton: DeskSource | null = null;
/** Process-wide DeskSource (reads import.meta.env). Scenario is read from the URL in DK1. */
export function getDeskSource(scenario: DeskScenario = null): DeskSource {
  if (scenario !== null) return createDeskSource({ VITE_DATA_SOURCE: readEnv(), scenario });
  singleton ??= createDeskSource({ VITE_DATA_SOURCE: readEnv() });
  return singleton;
}

function readEnv(): string | undefined {
  try {
    return (import.meta as unknown as { env?: { VITE_DATA_SOURCE?: string } }).env?.VITE_DATA_SOURCE;
  } catch {
    return undefined;
  }
}
