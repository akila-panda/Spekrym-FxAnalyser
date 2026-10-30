import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_MAX, REVIEW_STORAGE_KEY, applyEntry, parseEntries, reviewKey, reviewLookup, useReviewStore } from "./reviewStore";
import { DEFAULT_FILTERS, rowsFor } from "@/scan/selectors";
import { rejectedSetup, scanOf, validSetup } from "@/test/scanFixtures";

const scan = scanOf("M5", [validSetup("a", 0, 1), validSetup("b", 1, -1), rejectedSetup("r", 2)]);
const key = (id: string, pair = "EUR_USD") => reviewKey(pair, scan, id);

beforeEach(() => {
  localStorage.clear();
  useReviewStore.setState({ entries: {} });
});

describe("DX12 reviewStore", () => {
  it("keys by pair, strategy, timeframe, params hash and setup id", () => {
    expect(key("a")).not.toBe(key("b"));
    expect(key("a")).not.toBe(key("a", "GBP_USD"));
    const other = { ...scan, params_used: { ...scan.params_used, __x: 1 } };
    expect(reviewKey("EUR_USD", other, "a")).not.toBe(key("a"));
    expect(key("a")).toContain("|a");
  });

  it("toggles a mark on and off, and drops empty entries", () => {
    const { toggleMark } = useReviewStore.getState();
    toggleMark(key("a"), "right");
    expect(useReviewStore.getState().entries[key("a")]).toEqual({ mark: "right" });
    toggleMark(key("a"), "wrong");
    expect(useReviewStore.getState().entries[key("a")]).toEqual({ mark: "wrong" });
    toggleMark(key("a"), "wrong");
    expect(useReviewStore.getState().entries[key("a")]).toBeUndefined();
  });

  it("keeps a note without a mark, trims it, caps it, and clears it when empty", () => {
    const { setNote } = useReviewStore.getState();
    setNote(key("a"), "  odd wick\nhere ");
    expect(useReviewStore.getState().entries[key("a")]).toEqual({ note: "odd wick here" });
    setNote(key("a"), "x".repeat(NOTE_MAX + 50));
    expect(useReviewStore.getState().entries[key("a")]?.note).toHaveLength(NOTE_MAX);
    setNote(key("a"), "   ");
    expect(useReviewStore.getState().entries[key("a")]).toBeUndefined();
  });

  it("persists to localStorage and survives a reload", async () => {
    useReviewStore.getState().toggleMark(key("a"), "revisit");
    useReviewStore.getState().setNote(key("a"), "check news");
    expect(JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY)!)[key("a")]).toEqual({ mark: "revisit", note: "check news" });
    vi.resetModules();
    const fresh = await import("./reviewStore");
    expect(fresh.useReviewStore.getState().entries[key("a")]).toEqual({ mark: "revisit", note: "check news" });
  });

  it("ignores corrupt storage and invalid marks", () => {
    expect(parseEntries("{not json")).toEqual({});
    expect(parseEntries("[]")).toEqual({});
    expect(parseEntries(JSON.stringify({ k: { mark: "bogus" }, j: { mark: "right", note: 5 } }))).toEqual({ j: { mark: "right" } });
  });

  it("applyEntry is pure", () => {
    const base = Object.freeze({});
    expect(applyEntry(base, "k", { mark: "right" })).toEqual({ k: { mark: "right" } });
    expect(base).toEqual({});
  });

  it("lookup feeds rowsFor so the review filter composes with the others", () => {
    const panels = { H4: {}, H1: {}, M15: {}, M5: { status: "done", stale: false, result: scan }, M1: {}, D: {}, W: {} } as never;
    const entries = applyEntry(applyEntry({}, key("a"), { mark: "right" }), key("b"), { mark: "wrong" });
    const look = reviewLookup(entries, "EUR_USD", panels);
    const ids = (f: Partial<typeof DEFAULT_FILTERS>) => rowsFor(panels, "M5", { ...DEFAULT_FILTERS, showRejected: true, ...f }, look).map((r) => r.setup.id);
    expect(ids({})).toEqual(["a", "b", "r"]);
    expect(ids({ review: "right" })).toEqual(["a"]);
    expect(ids({ review: "wrong" })).toEqual(["b"]);
    expect(ids({ review: "unmarked" })).toEqual(["r"]);
    expect(ids({ review: "wrong", direction: "short" })).toEqual([]);
    expect(rowsFor(panels, "M5", { ...DEFAULT_FILTERS, review: "right" }).length).toBe(2);
  });
});