import { ScanAllButton } from "@/components/scan/ScanAllButton";
import { PaletteButton } from "@/components/ui/CommandPalette";
import { AppSwitch } from "@/desk/workspace/AppSwitch";
import { WindowsMenu } from "@/window/WindowsMenu";
import { WorkspaceQueue } from "@/window/WorkspaceQueue";
import { ControlBar } from "./ControlBar";
import "@/styles/desk.css";
import "@/styles/overflow.css";

export function HeaderBar() {
  return (
    <header className="region header-bar" aria-label="Controls">
      <AppSwitch />
      <strong>Survey Sheet+</strong>
      <ControlBar />
      <WindowsMenu />
      <WorkspaceQueue />
      <PaletteButton />
      <ScanAllButton />
    </header>
  );
}