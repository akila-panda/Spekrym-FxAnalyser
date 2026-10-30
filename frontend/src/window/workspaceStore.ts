/** W7: workspace restore queue. Window-scoped. Each blocked open waits for its own click (a fresh user gesture). */
import { create } from "zustand";
import { openPopout } from "./popout";
import { parseRole } from "./role";
import type { Bounds } from "./screens";
import { useScreenStore } from "./screenStore";
import { readWorkspaceParam, restoreWorkspace, type WorkspaceEntry } from "./workspaces";

interface WorkspaceState {
  /** Windows still to open. */
  queue: WorkspaceEntry[];
  /** Size of the workspace being restored. */
  total: number;
  /** Starts a restore (call from a user gesture). */
  restore: (entries: readonly WorkspaceEntry[]) => void;
  /** Opens as many queued windows as the browser allows from this click. */
  openNext: () => void;
  cancel: () => void;
}

const open = (e: WorkspaceEntry, bounds: Bounds | undefined): boolean =>
  openPopout(parseRole(`?window=${e.role}`), undefined, { bounds, fullscreen: e.fullscreen });

function run(entries: readonly WorkspaceEntry[]): WorkspaceEntry[] {
  return restoreWorkspace(entries, useScreenStore.getState().screens, open).rest;
}

/** A shared `?ws=` link restores nothing by itself (no gesture): it queues the windows for a click. Main window only. */
function initialQueue(): WorkspaceEntry[] {
  if (typeof window === "undefined") return [];
  if (parseRole(window.location.search).kind !== "main") return [];
  return readWorkspaceParam(window.location.search) ?? [];
}

const initial = initialQueue();

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  queue: initial,
  total: initial.length,
  restore: (entries) => set({ total: entries.length, queue: run(entries) }),
  openNext: () => set({ queue: run(get().queue) }),
  cancel: () => set({ queue: [], total: 0 }),
}));
