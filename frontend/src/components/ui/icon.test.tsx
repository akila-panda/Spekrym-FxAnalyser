import { render } from "@testing-library/react";
import { ICON_NAMES, Icon } from "./Icon";

describe("DX7 Icon", () => {
  it("renders every icon as a decorative svg with content", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg, name).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg!.childElementCount, name).toBeGreaterThan(0);
      unmount();
    }
  });
});