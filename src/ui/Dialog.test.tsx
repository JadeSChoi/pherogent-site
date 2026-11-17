import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

function dialogElement(): HTMLDialogElement {
  const el = document.querySelector("dialog");
  if (!el) throw new Error("no <dialog> rendered");
  return el;
}

describe("Dialog", () => {
  it("stays closed until opened", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Switch project">
        content
      </Dialog>,
    );
    expect(dialogElement().open).toBe(false);
  });

  it("shows its title and content when open", () => {
    render(
      <Dialog open onClose={() => {}} title="Switch project">
        <p>Pick a project.</p>
      </Dialog>,
    );
    expect(dialogElement().open).toBe(true);
    expect(screen.getByRole("heading", { name: "Switch project" })).toBeTruthy();
    expect(screen.getByText("Pick a project.")).toBeTruthy();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Switch project">
        content
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the dialog is cancelled (Escape)", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Switch project">
        content
      </Dialog>,
    );
    fireEvent(dialogElement(), new Event("cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
