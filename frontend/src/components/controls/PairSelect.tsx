import { useViewStore } from "@/store/viewStore";
import { PAIRS, type Pair } from "@/types/market";

export function PairSelect() {
  const pair = useViewStore((s) => s.pair);
  const setPair = useViewStore((s) => s.setPair);
  return (
    <label className="field">
      Pair{" "}
      <select value={pair} onChange={(e) => setPair(e.target.value as Pair)}>
        {PAIRS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </label>
  );
}