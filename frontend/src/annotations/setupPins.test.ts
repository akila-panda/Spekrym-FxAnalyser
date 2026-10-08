import { rejectedSetup, scanOf, validSetup } from "@/test/scanFixtures";
import { TF_SECONDS } from "@/types/market";
import { buildPins, hitPin, pinMarkers, type Pin } from "./setupPins";

const result = scanOf("M5", [validSetup("w", 0, 1.5), validSetup("l", 1, -1), rejectedSetup("r", 2)]);
const colors = { up: "#up", down: "#down", muted: "#muted" };

describe("setup pins", () => {
  it("builds one pin per setup, sorted by time, snapped to the scan timeframe's bars", () => {
    const pins = buildPins("M5", result);
    expect(pins.map((p) => p.id)).toEqual(["w", "l", "r"]);
    for (const p of pins) expect(p.time % TF_SECONDS.M5).toBe(0);
    expect(pins.map((p) => p.status)).toEqual(["valid", "valid", "rejected"]);
    expect(buildPins("M5", undefined)).toEqual([]);
  });

  it("anchors a valid setup on its trade and a rejected one on its focus start", () => {
    const [w, , r] = buildPins("M5", result);
    const setup = result.setups[0]!;
    const trade = setup.annotations.find((a) => a.kind === "trade")!;
    if (trade.kind !== "trade") throw new Error("expected trade");
    expect(w!.time).toBe(Math.floor(trade.t0 / 300) * 300);
    expect(r!.time).toBe(Math.floor(result.setups[2]!.focus.from / 300) * 300);
  });

  it("uses shape for valid vs rejected, colour for outcome, and a larger active pin", () => {
    const pins = buildPins("M5", result);
    const m = pinMarkers(pins, pins[1]!.key, colors);
    expect(m.map((x) => x.shape)).toEqual(["circle", "circle", "square"]);
    expect(m.map((x) => x.color)).toEqual(["#up", "#down", "#muted"]);
    expect(m.map((x) => x.size)).toEqual([1, 2, 1]);
  });

  it("hit-tests the pin above its bar and ignores clicks elsewhere", () => {
    const pins: Pin[] = [
      { key: "M5:a", tf: "M5", id: "a", time: 100, status: "valid", result: "win" },
      { key: "M5:b", tf: "M5", id: "b", time: 200, status: "valid", result: "loss" },
    ];
    const g = { timeX: (t: number) => t, highY: (t: number) => (t === 100 ? 150 : t === 200 ? null : 0) };
    expect(hitPin(pins, 102, 130, g)?.id).toBe("a"); // just above the bar
    expect(hitPin(pins, 102, 40, g)).toBeNull(); // far above
    expect(hitPin(pins, 102, 200, g)).toBeNull(); // below the bar
    expect(hitPin(pins, 130, 130, g)).toBeNull(); // too far across
    expect(hitPin(pins, 200, 10, g)).toBeNull(); // no bar loaded there
  });
});