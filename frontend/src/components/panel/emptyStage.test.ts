import { guideStep } from "./EmptyStage";

describe("DX7 guideStep", () => {
  it("walks pick, scan, select, then hides", () => {
    expect(guideStep(false, false, false)).toBe(1);
    expect(guideStep(true, false, false)).toBe(2);
    expect(guideStep(true, true, false)).toBe(3);
    expect(guideStep(true, true, true)).toBeNull();
  });

  it("an active setup always hides the guide", () => {
    expect(guideStep(false, false, true)).toBeNull();
  });
});