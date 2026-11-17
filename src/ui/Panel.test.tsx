import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("renders its title as a heading above its content", () => {
    render(
      <Panel title="Evidence record">
        <p>Lu et al., Nature, 2020</p>
      </Panel>,
    );
    expect(screen.getByRole("heading", { name: "Evidence record" })).toBeTruthy();
    expect(screen.getByText("Lu et al., Nature, 2020")).toBeTruthy();
  });

  it("renders without a title", () => {
    render(<Panel>plain surface</Panel>);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("plain surface")).toBeTruthy();
  });
});
