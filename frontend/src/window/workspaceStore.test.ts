import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./popout", () => ({ openPopout: vi.fn() }));

import { openPopout } from "./popout";
import { useWorkspaceStore } from "./workspaceStore";

const mocked = vi.mocked(openPopout);
const list = [
  { role: "charts", fullscreen: true, bounds: { x: 0, y: 0, width: 800, height: 600 } },
  { role: "setups", fullscreen: false },
  { role: "chart:M5", fullscreen: false },
];

describe("W7 workspace queue", () => {
  beforeEach(() => {
    mocked.mockReset();
    useWorkspaceStore.getState().cancel();
  });

  it("opens the first window, queues the blocked one and the rest, then drains on click", () => {
    mocked.mockReturnValueOnce(true).mockReturnValueOnce(false);
    useWorkspaceStore.getState().restore(list);
    expect(mocked.mock.calls[0]?.[0]).toEqual({ kind: "charts" });
    expect(mocked.mock.calls[0]?.[2]).toEqual({ bounds: list[0]!.bounds, fullscreen: true });
    expect(useWorkspaceStore.getState().queue.map((e) => e.role)).toEqual(["setups", "chart:M5"]);
    expect(useWorkspaceStore.getState().total).toBe(3);

    mocked.mockReturnValue(true);
    useWorkspaceStore.getState().openNext();
    expect(useWorkspaceStore.getState().queue).toEqual([]);
    expect(mocked.mock.calls.at(-1)?.[0]).toEqual({ kind: "chart", tf: "M5" });
  });

  it("keeps the queue when a click is still blocked, and cancel clears it", () => {
    mocked.mockReturnValue(false);
    useWorkspaceStore.getState().restore(list);
    expect(useWorkspaceStore.getState().queue).toHaveLength(3);
    useWorkspaceStore.getState().openNext();
    expect(useWorkspaceStore.getState().queue).toHaveLength(3);
    useWorkspaceStore.getState().cancel();
    expect(useWorkspaceStore.getState().queue).toEqual([]);
  });
});