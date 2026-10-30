import { compareStamp, createRevisions, shouldApply } from "./revision";

describe("W2 revision ordering", () => {
  it("compares by revision, then origin", () => {
    expect(compareStamp({ revision: 2, origin: "a" }, { revision: 1, origin: "z" })).toBe(1);
    expect(compareStamp({ revision: 1, origin: "a" }, { revision: 2, origin: "a" })).toBe(-1);
    expect(compareStamp({ revision: 1, origin: "b" }, { revision: 1, origin: "a" })).toBe(1);
    expect(compareStamp({ revision: 1, origin: "a" }, { revision: 1, origin: "a" })).toBe(0);
  });
  it("applies anything when nothing is held", () => {
    expect(shouldApply(undefined, { revision: 0, origin: "a" })).toBe(true);
  });
  it("counts per slice independently", () => {
    const r = createRevisions("w-a");
    expect(r.next("view").revision).toBe(1);
    expect(r.next("view").revision).toBe(2);
    expect(r.next("scan").revision).toBe(1);
  });
  it("accepts higher, rejects lower and duplicates", () => {
    const r = createRevisions("w-a");
    expect(r.accept({ slice: "view", revision: 5, origin: "w-b" })).toBe(true);
    expect(r.accept({ slice: "view", revision: 4, origin: "w-b" })).toBe(false);
    expect(r.accept({ slice: "view", revision: 5, origin: "w-b" })).toBe(false);
    expect(r.accept({ slice: "view", revision: 6, origin: "w-b" })).toBe(true);
  });
  it("next() always exceeds what was accepted", () => {
    const r = createRevisions("w-a");
    r.accept({ slice: "view", revision: 9, origin: "w-b" });
    expect(r.next("view").revision).toBe(10);
  });
  it("never accepts `all`", () => {
    expect(createRevisions("w-a").accept({ slice: "all", revision: 1, origin: "w-b" })).toBe(false);
  });
  it("converges on concurrent equal revisions", () => {
    const a = createRevisions("w-a");
    const b = createRevisions("w-b");
    const sa = a.next("view");
    const sb = b.next("view");
    expect(a.accept({ slice: "view", ...sb })).toBe(true);
    expect(b.accept({ slice: "view", ...sa })).toBe(false);
    expect(a.stamp("view")).toEqual(b.stamp("view"));
  });
});