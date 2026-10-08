import { ScanAllButton } from "@/components/scan/ScanAllButton";
import { ControlBar } from "./ControlBar";

export function HeaderBar() {
  return (
    <header className="region header-bar" aria-label="Controls">
      <strong>Survey Sheet+</strong>
      <ControlBar />
      <ScanAllButton />
    </header>
  );
}