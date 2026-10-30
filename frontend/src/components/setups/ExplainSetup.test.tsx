import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { baseRejected, baseValid } from "@/test/scanFixtures";
import { buildExplainChain, ExplainSetup, orderConditions } from "./ExplainSetup";

beforeEach(() => {
  useViewStore.setState({ timezone: "utc" });
  useAnnotationStore.setState({ step: null });
});

describe("E6 buildExplainChain", () => {
  it("orders steps by known_at then n", () => {
    const setup = {
      steps: [
        { n: 3, label: "c", known_at: 300 },
        { n: 1, label: "a", known_at: 100 },
        { n: 2, label: "b", known_at: 100 },
      ],
      annotations: [],
    };
    expect(buildExplainChain(setup).map((r) => r.step.n)).toEqual([1, 2, 3]);
  });

  it("counts annotations per step", () => {
    const rows = buildExplainChain(baseValid);
    const total = rows.reduce((n, r) => n + r.marks, 0);
    expect(total).toBe(baseValid.annotations.filter((a) => baseValid.steps.some((s) => s.n === a.step)).length);
  });

  it("puts failed conditions first", () => {
    const out = orderConditions([
      { key: "a", label: "a", passed: true, detail: "" },
      { key: "b", label: "b", passed: null, detail: "" },
      { key: "c", label: "c", passed: false, detail: "" },
    ]);
    expect(out.map((c) => c.key)).toEqual(["c", "a", "b"]);
  });
});

describe("E6 ExplainSetup", () => {
  it("renders every step in order with a heading and exploratory badge", () => {
    render(<ExplainSetup setup={baseValid} />);
    expect(screen.getByText("Why this qualified")).toBeInTheDocument();
    expect(screen.getByText("exploratory")).toBeInTheDocument();
    const items = screen.getAllByRole("button", { name: /^Step \d+:/ });
    expect(items).toHaveLength(baseValid.steps.length);
  });

  it("clicking a step sets and clears the scrubber step", async () => {
    render(<ExplainSetup setup={baseValid} />);
    const first = screen.getAllByRole("button", { name: /^Step \d+:/ })[0]!;
    await userEvent.click(first);
    expect(useAnnotationStore.getState().step).not.toBeNull();
    await userEvent.click(first);
    expect(useAnnotationStore.getState().step).toBeNull();
  });

  it("labels a rejected setup", () => {
    render(<ExplainSetup setup={baseRejected} />);
    expect(screen.getByText("Why this was rejected")).toBeInTheDocument();
  });
});