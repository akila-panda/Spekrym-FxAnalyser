import { resolveTz, type TimezoneMode } from "@/lib/format";
import { useViewStore } from "@/store/viewStore";

export function TimezoneSelect() {
  const timezone = useViewStore((s) => s.timezone);
  const setTimezone = useViewStore((s) => s.setTimezone);
  return (
    <label className="field">
      Time zone{" "}
      <select value={timezone === "strategy" ? "utc" : timezone} onChange={(e) => setTimezone(e.target.value as TimezoneMode)}>
        <option value="utc">UTC</option>
        <option value="local">Local ({resolveTz("local")})</option>
      </select>
    </label>
  );
}