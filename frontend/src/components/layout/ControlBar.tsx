import type { DataSource } from "@/api/dataSource";
import { AsOfPicker } from "@/components/controls/AsOfPicker";
import { LayoutSwitch } from "@/components/controls/LayoutSwitch";
import { LinkToggle } from "@/components/controls/LinkToggle";
import { ModeSwitch } from "@/components/controls/ModeSwitch";
import { OverflowMenu } from "@/components/controls/OverflowMenu";
import { PairSelect } from "@/components/controls/PairSelect";
import { TimezoneSelect } from "@/components/controls/TimezoneSelect";

export function ControlBar({ source }: { source?: DataSource }) {
  return (
    <>
      <PairSelect />
      <AsOfPicker source={source} />
      <TimezoneSelect />
      <ModeSwitch />
      <span className="spacer" />
      <LayoutSwitch />
      <LinkToggle />
      <OverflowMenu />
    </>
  );
}