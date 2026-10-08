import type { DataSource } from "@/api/dataSource";
import { AsOfPicker } from "@/components/controls/AsOfPicker";
import { LayoutSwitch } from "@/components/controls/LayoutSwitch";
import { LinkToggle } from "@/components/controls/LinkToggle";
import { PairSelect } from "@/components/controls/PairSelect";
import { PresetBar } from "@/components/controls/PresetBar";
import { TimezoneSelect } from "@/components/controls/TimezoneSelect";

export function ControlBar({ source }: { source?: DataSource }) {
  return (
    <>
      <PairSelect />
      <AsOfPicker source={source} />
      <TimezoneSelect />
      <span className="spacer" />
      <PresetBar />
      <LinkToggle />
      <LayoutSwitch />
    </>
  );
}