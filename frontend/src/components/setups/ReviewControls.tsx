/** DX12: review marks for the selected setup, plus the list filter chips. Local only; never part of the strategy result. */
import { useState } from "react";
import { MARKS, MARK_GLYPH, MARK_TEXT, NOTE_MAX, REVIEW_LABEL, reviewKey, useReviewStore } from "@/review/reviewStore";
import type { ReviewFilter } from "@/scan/selectors";
import { useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import "@/styles/review.css";

const KEY_HINT = { right: "Y", wrong: "N", revisit: "R" } as const;

/** Key for the active setup, or null when nothing is selected. */
export function useActiveReviewKey(): string | null {
  const active = useScanStore((s) => s.active);
  const result = useScanStore((s) => (s.active ? s.panels[s.active.tf].result : undefined));
  const pair = useViewStore((s) => s.pair);
  return active && result ? reviewKey(pair, result, active.id) : null;
}

export function ReviewControls() {
  const key = useActiveReviewKey();
  if (!key) return null;
  return <ReviewBody key={key} reviewId={key} />;
}

function ReviewBody({ reviewId }: { reviewId: string }) {
  const entry = useReviewStore((s) => s.entries[reviewId]);
  const toggle = useReviewStore((s) => s.toggleMark);
  const setNote = useReviewStore((s) => s.setNote);
  const [draft, setDraft] = useState(entry?.note ?? "");
  const commit = () => {
    setNote(reviewId, draft);
    setDraft((d) => d.replace(/[\r\n]+/g, " ").trim().slice(0, NOTE_MAX));
  };
  return (
    <section className="review" aria-label="Review">
      <div className="review-marks" role="group" aria-label="Review mark">
        {MARKS.map((m) => (
          <button
            key={m}
            type="button"
            className="review-btn"
            aria-pressed={entry?.mark === m}
            title={`${MARK_TEXT[m]} (${KEY_HINT[m]})`}
            onClick={() => toggle(reviewId, m)}
          >
            <span aria-hidden="true" className="review-glyph-inline">{MARK_GLYPH[m]}</span> {MARK_TEXT[m]}
          </button>
        ))}
      </div>
      <input
        type="text"
        className="review-note"
        aria-label="Review note"
        placeholder="Note"
        maxLength={NOTE_MAX}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <p className="hint review-label">{REVIEW_LABEL}</p>
    </section>
  );
}

const CHIPS: readonly { v: ReviewFilter; text: string }[] = [
  { v: "all", text: "All" },
  { v: "right", text: `${MARK_GLYPH.right} Right` },
  { v: "wrong", text: `${MARK_GLYPH.wrong} Wrong` },
  { v: "revisit", text: `${MARK_GLYPH.revisit} Revisit` },
  { v: "unmarked", text: "Unmarked" },
];

/** Shown once any mark exists, or while a review filter is on. */
export function ReviewFilterChips() {
  const filter = useScanStore((s) => s.filters.review);
  const set = useScanStore((s) => s.setFilters);
  const any = useReviewStore((s) => Object.keys(s.entries).length > 0);
  if (!any && filter === "all") return null;
  return (
    <div className="review-chips" role="group" aria-label="Review filter" title={REVIEW_LABEL}>
      {CHIPS.map((c) => (
        <button key={c.v} type="button" className="review-chip" aria-pressed={filter === c.v} onClick={() => set({ review: c.v })}>
          {c.text}
        </button>
      ))}
    </div>
  );
}