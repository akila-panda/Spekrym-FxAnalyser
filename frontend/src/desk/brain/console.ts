/** F16 — Master Brain Console view (pure, read-only, causal). Proposals are PROPOSALS: the Brain can propose
 *  but never approve, certify, read the VAULT, write a verdict, place an order or lift a limit (D6/D11).
 *  Only a decision by a HUMAN actor counts; a Brain/self decision is shown as invalid and changes nothing.
 *  Forbidden capabilities stay denied even if a record says granted. Nothing renders before its timestamp. */
import { CAPABILITIES, type AuthorizationDecision, type BrainBudget, type BrainConsoleSnapshot, type BrainObjective, type BrainProposal, type Capability } from "@/intel/brainContracts";

export const FORBIDDEN: ReadonlySet<Capability> = new Set<Capability>(["read_vault", "write_verdict", "change_judge_config", "place_order", "lift_limit"]);
export const CAP_LABEL: Record<Capability, string> = {
  propose_hypothesis: "Propose hypotheses", draft_spec: "Draft strategy specs", register_experiment: "Register experiments",
  read_vault: "Read the VAULT", write_verdict: "Write a verdict", change_judge_config: "Change Judge config",
  place_order: "Place an order", lift_limit: "Lift a risk limit",
};
export const STATE_META = {
  pending: { glyph: "◇", label: "Awaiting human decision" },
  human_approved: { glyph: "✓", label: "Human-approved (still a proposal; the Judge decides)" },
  human_rejected: { glyph: "✕", label: "Human-rejected" },
  expired: { glyph: "◌", label: "Expired" },
} as const;
export type ProposalState = keyof typeof STATE_META;
export const isHuman = (actor: string): boolean => /^human:/.test(actor);

export interface ProposalRow { p: BrainProposal; state: ProposalState; decidedBy?: string; invalid: AuthorizationDecision[] }
export interface PermissionRow { capability: Capability; granted: boolean; reason: string; overridden?: string }
export interface BudgetRow { b: BrainBudget; pct: number; state: "ok" | "near" | "exhausted"; label: string }
export interface ConsoleView {
  objectives: (BrainObjective & { proposals: number })[];
  proposals: ProposalRow[];
  queue: ProposalRow[];
  stateCounts: { state: ProposalState; count: number }[];
  permissions: PermissionRow[];
  budgets: BudgetRow[];
  log: (AuthorizationDecision & { valid: boolean })[];
}

const targetOf = (action: string): { verb: "approve" | "reject"; id: string } | null => {
  const m = /^(approve|reject):(.+)$/.exec(action);
  return m ? { verb: m[1] as "approve" | "reject", id: m[2]! } : null;
};

export function viewConsole(s: BrainConsoleSnapshot, asOf: number): ConsoleView {
  const decisions = s.decisions.filter((d) => d.timestamp <= asOf).sort((a, b) => a.timestamp - b.timestamp);
  const proposals: ProposalRow[] = s.proposals.filter((p) => p.proposedAt <= asOf).map((p) => {
    const mine = decisions.filter((d) => targetOf(d.action)?.id === p.id);
    const valid = mine.filter((d) => isHuman(d.actor));
    const last = valid[valid.length - 1];
    let state: ProposalState = "pending";
    if (last) state = targetOf(last.action)!.verb === "approve" ? "human_approved" : "human_rejected";
    else if (p.expiresAt !== undefined && p.expiresAt <= asOf) state = "expired";
    return { p, state, decidedBy: last?.actor, invalid: mine.filter((d) => !isHuman(d.actor)) };
  }).sort((a, b) => a.p.proposedAt - b.p.proposedAt);

  const permissions: PermissionRow[] = CAPABILITIES.map((capability) => {
    const rec = s.permissions.filter((x) => x.capability === capability && x.effectiveFrom <= asOf).sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
    if (!rec) return { capability, granted: false, reason: "No grant on record." };
    if (rec.granted && FORBIDDEN.has(capability)) return { capability, granted: false, reason: rec.reason, overridden: "Hard-denied: the Brain can never hold this capability (D11); the record is ignored." };
    return { capability, granted: rec.granted, reason: rec.reason };
  });

  const latest = new Map<string, BrainBudget>();
  for (const b of s.budgets.filter((x) => x.observedAt <= asOf).sort((a, c) => a.observedAt - c.observedAt)) latest.set(b.id, b);
  const budgets: BudgetRow[] = [...latest.values()].map((b) => {
    const pct = b.used / b.limit;
    const state = pct >= 1 ? "exhausted" : pct >= 0.8 ? "near" : "ok";
    return { b, pct, state, label: state === "exhausted" ? "Exhausted ✕" : state === "near" ? "Near limit ⚠" : "Within budget ●" };
  });

  return {
    proposals,
    queue: proposals.filter((r) => r.state === "pending"),
    stateCounts: (Object.keys(STATE_META) as ProposalState[]).map((state) => ({ state, count: proposals.filter((r) => r.state === state).length })),
    objectives: s.objectives.filter((o) => o.createdAt <= asOf).map((o) => ({ ...o, proposals: proposals.filter((r) => r.p.objectiveId === o.id).length })),
    permissions, budgets,
    log: decisions.map((d) => ({ ...d, valid: isHuman(d.actor) })),
  };
}

export const workbenchHref = "/?window=workbench";