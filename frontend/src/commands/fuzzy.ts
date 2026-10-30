/** DX11: tiny fuzzy matcher for the command palette. Pure. Case-insensitive subsequence match with a score. */

export interface FuzzyMatch {
  score: number;
  /** Indices in `text` of the matched characters. */
  positions: number[];
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[a-z0-9]/i.test(c);

/** Null when `query` is not a subsequence of `text`. An empty query matches everything with score 0. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return { score: 0, positions: [] };
  const t = text.toLowerCase();
  const prefix = query.toLowerCase().trim();
  let best: FuzzyMatch | null = null;
  for (let start = t.indexOf(q[0]!); start >= 0; start = t.indexOf(q[0]!, start + 1)) {
    const positions = [start];
    let from = start + 1;
    let ok = true;
    for (let i = 1; i < q.length; i += 1) {
      const idx = t.indexOf(q[i]!, from);
      if (idx < 0) {
        ok = false;
        break;
      }
      positions.push(idx);
      from = idx + 1;
    }
    if (!ok) break; // a later start has fewer characters left, so it cannot match either
    let score = q.length * 10;
    positions.forEach((p, i) => {
      const prev = positions[i - 1];
      if (prev !== undefined) score += p === prev + 1 ? 15 : -Math.min(3, p - prev - 1);
      if (!isWordChar(t[p - 1])) score += 10;
    });
    if (positions[0] === 0) score += 20;
    if (t.startsWith(prefix)) score += 40;
    score -= t.length * 0.1;
    if (!best || score > best.score) best = { score, positions };
  }
  return best;
}

export const fuzzyScore = (query: string, text: string): number | null => fuzzyMatch(query, text)?.score ?? null;

/** Items that match, best first; ties keep the original order. Empty query returns the items unchanged. */
export function fuzzyFilter<T>(items: readonly T[], query: string, text: (item: T) => string, limit = Infinity): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item, i) => ({ item, i, s: fuzzyScore(query, text(item)) }))
    .filter((r): r is { item: T; i: number; s: number } => r.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.item);
}