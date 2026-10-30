/** DESK DK18 — ephemeral replay state (never persisted, never replicated) and the transport actions.
 *  The only clock written is deskUiStore.asOf; viewStore.asOf is never touched. */
import { create } from "zustand";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import type { Pair } from "@/types/market";
import { closeTimes, prefersReducedMotion, startPoint, stepFrom, type Speed, type StepTf } from "./replayClock";

interface ReplayState {
  playing: boolean;
  speed: Speed;
  stepTf: StepTf;
  setSpeed: (s: Speed) => void;
  setStepTf: (tf: StepTf) => void;
  setPlaying: (p: boolean) => void;
}

export const useReplayStore = create<ReplayState>()((set) => ({
  playing: false,
  speed: 1,
  stepTf: "M15",
  setSpeed: (speed) => set({ speed }),
  setStepTf: (stepTf) => set({ stepTf }),
  setPlaying: (playing) => set({ playing }),
}));

const ui = () => useDeskUiStore.getState();
const rp = () => useReplayStore.getState();

/** Step one bar. Stepping pauses playback. */
export function stepReplay(pair: Pair, dir: 1 | -1): void {
  rp().setPlaying(false);
  ui().setAsOf(stepFrom(closeTimes(pair, rp().stepTf), ui().asOf, dir));
}

/** Start playing (from "latest" it first rewinds START_BACK bars). No-op under reduced motion; returns whether it started. */
export function playReplay(pair: Pair): boolean {
  if (prefersReducedMotion()) return false;
  const times = closeTimes(pair, rp().stepTf);
  if (ui().asOf === "latest") ui().setAsOf(startPoint(times));
  rp().setPlaying(true);
  return true;
}

export const pauseReplay = (): void => rp().setPlaying(false);

/** One playback tick; reaching the last closed bar returns to "latest" and pauses. */
export function tickReplay(pair: Pair): void {
  const next = stepFrom(closeTimes(pair, rp().stepTf), ui().asOf, 1);
  ui().setAsOf(next);
  if (next === "latest") rp().setPlaying(false);
}

export function toLatest(): void {
  rp().setPlaying(false);
  ui().setAsOf("latest");
}