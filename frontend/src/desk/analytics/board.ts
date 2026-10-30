/** F14 — Validation ledger board (pure, read-only). Displays Judge output; never decides, promotes, or
 *  reaches the VAULT. Honesty rules: every verdict is shown with the TOTAL variants tested (experiment_count,
 *  not just the rows listed); all 4 evidence tiers are always listed (zeros shown); a claimed tier is
 *  downgraded when its evidence is missing (vault_confirmed needs a logged final-confirmation read; a
 *  non-PASS verdict can't be "validated"); causal — nothing before its timestamp. */
import type { EvidenceTier, ExperimentRecord, LedgerSnapshot } from "@/intel/contracts";

export const TIERS = ["exploratory", "in_sample", "validated", "vault_confirmed"] as const satisfies readonly EvidenceTier[];
export const TIER_META: Record<EvidenceTier, { label: string; glyph: string; note: string }> = {
  exploratory: { label: "Exploratory", glyph: "○", note: "Un-judged / train only." },
  in_sample: { label: "In-sample", glyph: "◐", note: "Judged on train/valid; not out-of-sample confirmed." },
  validated: { label: "Validated", glyph: "●", note: "PASS on validation split." },
  vault_confirmed: { label: "Vault-confirmed", glyph: "★", note: "PASS via a logged final-confirmation holdout read." },
};
export const isTier = (v: unknown): v is EvidenceTier => typeof v === "string" && (TIERS as readonly string[]).includes(v);
export const SAMPLE_FLOOR = 30;

export interface ExperimentRow {
  record: ExperimentRecord;
  claimedTier: EvidenceTier;
  tier: EvidenceTier;
  /** Why the shown tier is lower than the claimed one (never silent). */
  downgrade?: string;
  lowSample: boolean;
}

export interface LedgerView {
  /** Total variants tested (the multiple-testing denominator); null until the report exists at asOf. */
  tested: number | null;
  listed: number;
  fdrAlpha: number;
  rows: ExperimentRow[];
  tierCounts: { tier: EvidenceTier; count: number }[];
  vault: { consultations: number; entries: number };
  label: string;
}

export function effectiveTier(rec: ExperimentRecord, vaultLog: LedgerSnapshot["vault"]["log"]): Pick<ExperimentRow, "claimedTier" | "tier" | "downgrade"> {
  const claimed: EvidenceTier = rec.verdict.evidence_tier ?? "exploratory";
  if (claimed === "vault_confirmed") {
    const backed = rec.verdict.status === "PASS" && vaultLog.some((e) => e.experimentId === rec.id && e.finalConfirmation);
    if (!backed) return { claimedTier: claimed, tier: rec.verdict.status === "PASS" ? "validated" : "in_sample", downgrade: "no logged final-confirmation holdout read (or not PASS)" };
  }
  if (claimed === "validated" && rec.verdict.status !== "PASS") {
    return { claimedTier: claimed, tier: "in_sample", downgrade: "verdict is not PASS" };
  }
  return { claimedTier: claimed, tier: claimed };
}

/** Causal read-only view at asOf (Infinity = latest). */
export function viewLedger(ledger: LedgerSnapshot, asOf: number = Infinity): LedgerView {
  const log = ledger.vault.log.filter((e) => e.ts <= asOf);
  const rows: ExperimentRow[] = ledger.experiments
    .filter((e) => e.ts <= asOf)
    .map((record) => ({ record, ...effectiveTier(record, log), lowSample: record.verdict.n_trades < SAMPLE_FLOOR }))
    .sort((a, b) => b.record.ts - a.record.ts);
  const reportKnown = ledger.createdAt <= asOf;
  const tested = reportKnown ? ledger.experiment_count : null;
  return {
    tested, listed: rows.length, fdrAlpha: ledger.fdr_alpha, rows,
    tierCounts: TIERS.map((tier) => ({ tier, count: rows.filter((r) => r.tier === tier).length })),
    // consultations is a count as of the snapshot; before the report exists it is unknown, shown as the logged entries only.
    vault: { consultations: reportKnown ? ledger.vault.consultations : log.length, entries: log.length },
    label: tested === null ? "Variants tested: not yet known at this time" : `Tested ${tested} variants (${rows.length} listed)`,
  };
}

export const filterTiers = (rows: readonly ExperimentRow[], shown: readonly EvidenceTier[]): ExperimentRow[] =>
  rows.filter((r) => shown.includes(r.tier));