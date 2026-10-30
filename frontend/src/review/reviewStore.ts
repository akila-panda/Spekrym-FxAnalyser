/** DX12: local human review marks. Class "local-persisted, not synced": localStorage only, never replicated across windows. */
import { create } from "zustand";
import { paramsHash } from "@/sync/scanLock";
import type { PanelsLike, ReviewLookup, ReviewMark } from "@/scan/selectors";
import type { ScanResult } from "@/types";

export const REVIEW_STORAGE_KEY = "spekrym.review.v1";
export const NOTE_MAX = 200;
export const REVIEW_LABEL = "Human review, not strategy result";

export interface ReviewEntry {
  mark?: ReviewMark;
  note?: string;
}
export type ReviewEntries = Readonly<Record<string, ReviewEntry>>;

export const MARKS: readonly ReviewMark[] = ["right", "wrong", "revisit"];
export const MARK_GLYPH: Record<ReviewMark, string> = { right: "✓", wrong: "✗", revisit: "?" };
export const MARK_TEXT: Record<ReviewMark, string> = { right: "Looks right", wrong: "Looks wrong", revisit: "Revisit" };
/** `?` is taken by the shortcuts sheet, so "revisit" is the R key. The glyph stays `?`. */
export const MARK_KEY: Record<string, ReviewMark> = { y: "right", n: "wrong", r: "revisit" };

const isMark = (v: unknown): v is ReviewMark => v === "right" || v === "wrong" || v === "revisit";
const cleanNote = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\r\n]+/g, " ").trim().slice(0, NOTE_MAX);
  return t === "" ? undefined : t;
};

/** Marks belong to one setup of one scan configuration: pair, strategy, timeframe, params and setup id. */
export function reviewKey(pair: string, r: Pick<ScanResult, "strategy" | "timeframe" | "params_used">, setupId: string): string {
  return `${pair}|${r.strategy.id}|${r.timeframe}|${paramsHash(r.params_used)}|${setupId}`;
}

/** Applies a patch and drops entries that end up empty. Pure. */
export function applyEntry(entries: ReviewEntries, key: string, patch: { mark?: ReviewMark | null; note?: string | null }): ReviewEntries {
  const cur = entries[key] ?? {};
  const mark = patch.mark === undefined ? cur.mark : patch.mark === null ? undefined : patch.mark;
  const note = patch.note === undefined ? cur.note : cleanNote(patch.note);
  const next: ReviewEntry = {};
  if (mark) next.mark = mark;
  if (note) next.note = note;
  const out = { ...entries };
  if (next.mark || next.note) out[key] = next;
  else delete out[key];
  return out;
}

export function parseEntries(raw: string | null): ReviewEntries {
  if (!raw) return {};
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    let out: ReviewEntries = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const e = v as { mark?: unknown; note?: unknown };
      out = applyEntry(out, k, { mark: isMark(e.mark) ? e.mark : null, note: cleanNote(e.note) ?? null });
    }
    return out;
  } catch {
    return {};
  }
}

export function loadEntries(): ReviewEntries {
  try {
    return parseEntries(localStorage.getItem(REVIEW_STORAGE_KEY));
  } catch {
    return {};
  }
}

function save(entries: ReviewEntries): void {
  try {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable: marks last for this session only */
  }
}

interface State {
  entries: ReviewEntries;
  /** Setting the mark that is already set clears it. */
  toggleMark: (key: string, mark: ReviewMark) => void;
  setNote: (key: string, note: string) => void;
}

export const useReviewStore = create<State>()((set, get) => ({
  entries: loadEntries(),
  toggleMark: (key, mark) => {
    const entries = applyEntry(get().entries, key, { mark: get().entries[key]?.mark === mark ? null : mark });
    save(entries);
    set({ entries });
  },
  setNote: (key, note) => {
    const entries = applyEntry(get().entries, key, { note });
    if (entries === get().entries) return;
    save(entries);
    set({ entries });
  },
}));

/** Resolves marks for rows of the given panels. */
export function reviewLookup(entries: ReviewEntries, pair: string, panels: PanelsLike): ReviewLookup {
  return (tf, setupId) => {
    const r = panels[tf].result;
    return r ? entries[reviewKey(pair, r, setupId)]?.mark : undefined;
  };
}