import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_NOW } from "@/intel/fixtures";
import { BrainConsoleSnapshotSchema, CAPABILITIES } from "@/intel/brainContracts";
import { SAMPLE_BRAIN } from "@/intel/brainFixtures";
import { createMockIntelligenceSource } from "@/intel/mockSource";
import { parseRole } from "@/window/role";
import { FORBIDDEN, viewConsole } from "./console";
import { BrainRoot } from "./BrainRoot";

beforeEach(() => { window.history.replaceState(null, "", "/?window=brain"); });
const row = (id: string) => viewConsole(SAMPLE_BRAIN, SAMPLE_NOW).proposals.find((r) => r.p.id === id)!;

describe("F16 console (pure)", () => {
  it("fixture conforms; role parses; mock source is sample", async () => {
    expect(() => BrainConsoleSnapshotSchema.parse(SAMPLE_BRAIN)).not.toThrow();
    expect(parseRole("?window=brain")).toEqual({ kind: "brain" });
    expect((await createMockIntelligenceSource().getBrain()).provenance.kind).toBe("sample");
    expect((await createMockIntelligenceSource({ missing: true }).getBrain()).data.proposals).toEqual([]);
  });

  it("proposal states derive only from valid human decisions", () => {
    expect(row("prop:1").state).toBe("human_approved");
    expect(row("prop:3").state).toBe("pending");
    expect(row("prop:4").state).toBe("expired");
    expect(row("prop:5").state).toBe("human_rejected");
  });

  it("a Brain self-approval is ignored (stays pending) and surfaced", () => {
    const r = row("prop:2");
    expect(r.state).toBe("pending");
    expect(r.invalid.map((d) => d.actor)).toEqual(["master_brain"]);
    const v = viewConsole(SAMPLE_BRAIN, SAMPLE_NOW);
    expect(v.log.find((d) => d.actor === "master_brain")!.valid).toBe(false);
    expect(v.queue.map((q) => q.p.id)).toEqual(["prop:2", "prop:3"]);
  });

  it("all four states always counted, zeros shown", () => {
    const v = viewConsole({ ...SAMPLE_BRAIN, proposals: [], decisions: [] }, SAMPLE_NOW);
    expect(v.stateCounts.map((c) => c.state)).toEqual(["pending", "human_approved", "human_rejected", "expired"]);
    expect(v.stateCounts.every((c) => c.count === 0)).toBe(true);
  });

  it("every capability always listed; forbidden ones stay denied even if a record says granted", () => {
    const v = viewConsole(SAMPLE_BRAIN, SAMPLE_NOW);
    expect(v.permissions.map((p) => p.capability)).toEqual([...CAPABILITIES]);
    const vault = v.permissions.find((p) => p.capability === "read_vault")!;
    expect(vault.granted).toBe(false);
    expect(vault.overridden).toMatch(/Hard-denied/);
    for (const c of FORBIDDEN) expect(v.permissions.find((p) => p.capability === c)!.granted).toBe(false);
    expect(v.permissions.find((p) => p.capability === "place_order")!.reason).toBe("No grant on record.");
    expect(v.permissions.find((p) => p.capability === "propose_hypothesis")!.granted).toBe(true);
  });

  it("budgets: ok / near / exhausted derived from used/limit", () => {
    const b = viewConsole(SAMPLE_BRAIN, SAMPLE_NOW).budgets;
    expect(b.map((x) => [x.b.id, x.state])).toEqual([["bud:tokens", "ok"], ["bud:jobs", "near"], ["bud:exp", "exhausted"]]);
  });

  it("causal: nothing before its timestamp; an approval is not visible before it was made", () => {
    expect(viewConsole(SAMPLE_BRAIN, 0)).toMatchObject({ objectives: [], proposals: [], budgets: [], log: [] });
    const before = viewConsole(SAMPLE_BRAIN, SAMPLE_NOW - 49_000);
    expect(before.proposals.find((r) => r.p.id === "prop:1")!.state).toBe("pending");
    expect(before.proposals.find((r) => r.p.id === "prop:4")!.state).toBe("expired");
    expect(viewConsole(SAMPLE_BRAIN, SAMPLE_NOW - 70_000).proposals.find((r) => r.p.id === "prop:4")!.state).toBe("pending");
    expect(viewConsole(SAMPLE_BRAIN, SAMPLE_NOW - 49_000).permissions.find((p) => p.capability === "draft_spec")!.granted).toBe(true);
    expect(viewConsole(SAMPLE_BRAIN, SAMPLE_NOW - 200_000).permissions.every((p) => !p.granted)).toBe(true);
  });
});

describe("F16 BrainRoot", () => {
  it("renders sample badge, six sections; proposals labelled as proposals with glyph+text", async () => {
    render(<BrainRoot />);
    await screen.findByRole("region", { name: "Proposals" });
    expect(screen.getByText("sample")).toBeInTheDocument();
    for (const n of ["Research objectives", "Proposals", "Approval queue", "Permissions", "Budgets", "Authorization log"]) {
      expect(screen.getByRole("region", { name: n })).toBeInTheDocument();
    }
    const props = within(screen.getByRole("region", { name: "Proposals" }));
    const rows = props.getAllByRole("button");
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r).toHaveTextContent(/◇ Proposal/);
    expect(props.getByText(/Human-approved \(still a proposal; the Judge decides\)/)).toBeInTheDocument();
  });

  it("approval queue is read-only and says so; permissions + budgets render with text cues", async () => {
    render(<BrainRoot />);
    const q = within(await screen.findByRole("region", { name: "Approval queue" }));
    expect(q.getByText(/cannot approve/)).toBeInTheDocument();
    expect(q.getAllByRole("listitem")).toHaveLength(2);
    const perms = within(screen.getByRole("region", { name: "Permissions" }));
    expect(perms.getByText(/✕ Denied — Read the VAULT/)).toBeInTheDocument();
    expect(perms.getByRole("note")).toHaveTextContent(/Hard-denied/);
    const bud = within(screen.getByRole("region", { name: "Budgets" }));
    for (const t of ["Within budget ●", "Near limit ⚠", "Exhausted ✕"]) expect(bud.getByText(t)).toBeInTheDocument();
    expect(bud.getAllByRole("meter")).toHaveLength(3);
  });

  it("self-approval is flagged in the log and on the proposal", async () => {
    render(<BrainRoot />);
    const log = within(await screen.findByRole("region", { name: "Authorization log" }));
    expect(log.getByText(/✕ not counted master_brain/)).toBeInTheDocument();
    expect(screen.getByText(/ignored a non-human decision by master_brain/)).toBeInTheDocument();
  });

  it("keyboard: select a proposal; detail + workbench link have accessible names", async () => {
    const user = userEvent.setup();
    render(<BrainRoot />);
    const btn = await screen.findByRole("button", { name: /Order-block reclaim continues in NY/ });
    btn.focus();
    await user.keyboard("{Enter}");
    expect(within(screen.getByRole("region", { name: "Proposals" })).getByRole("note")).toHaveTextContent(/not a verdict/);
    expect(screen.getByRole("link", { name: "Open hyp:1 in the research workbench" })).toHaveAttribute("href", "/?window=workbench");
  });

  it("read-only: no approve/reject/promote/grant/register/vault/run controls", async () => {
    render(<BrainRoot />);
    await screen.findByRole("region", { name: "Proposals" });
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.some((n) => /^(approve|reject|promote|grant|revoke|register|confirm|run|deploy|vault)/i.test(n.trim()))).toBe(false);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("causal: before any timestamp nothing is listed", async () => {
    render(<BrainRoot asOf={0} />);
    await waitFor(() => expect(screen.getByText("No proposals known at this time.")).toBeInTheDocument());
    expect(screen.getByText("No decisions recorded at this time.")).toBeInTheDocument();
  });
});