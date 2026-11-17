import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a quiet button of type button by default", () => {
    render(<Button>Edit sentence</Button>);
    const button = screen.getByRole("button", { name: "Edit sentence" });
    expect(button).toHaveProperty("type", "button");
    expect(button.className).toContain("ui-button-quiet");
  });

  it("renders the primary and link variants", () => {
    render(
      <>
        <Button variant="primary">Add paper</Button>
        <Button variant="link">Dismiss</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Add paper" }).className).toContain("ui-button-primary");
    expect(screen.getByRole("button", { name: "Dismiss" }).className).toContain("ui-button-link");
  });

  it("fires onClick, except when disabled", () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Go</Button>
        <Button onClick={onClick} disabled>Held</Button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    fireEvent.click(screen.getByRole("button", { name: "Held" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps a submit type when asked for one", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("type", "submit");
  });
});
