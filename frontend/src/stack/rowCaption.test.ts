import { describe, expect, it } from "vitest";
import { rowCaption, rowRole } from "./rowCaption";

describe("DX4 rowCaption", () => {
  it("follows TF order around the setup TF", () => {
    expect(rowCaption("D", "M15")).toBe("Context");
    expect(rowCaption("H1", "M15")).toBe("Context");
    expect(rowCaption("M15", "M15")).toBe("Focus");
    expect(rowCaption("M5", "M15")).toBe("Detail");
    expect(rowCaption("M1", "M15")).toBe("Detail");
  });
  it("is null without a setup", () => {
    expect(rowCaption("H1", null)).toBeNull();
    expect(rowRole("H1", null)).toBeNull();
  });
  it("a M1 setup has no detail rows", () => {
    expect(rowRole("M1", "M1")).toBe("focus");
    expect(rowRole("M5", "M1")).toBe("context");
  });
});