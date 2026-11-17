import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Nav } from "./Nav";

const items = [
  { label: "Overview", href: "#overview" },
  { label: "Library", href: "#library", count: 20, current: true },
  { label: "Manuscript", href: "#manuscript" },
];

describe("Nav", () => {
  it("renders a labelled navigation landmark", () => {
    render(<Nav label="Project" items={items} />);
    expect(screen.getByRole("navigation", { name: "Project" })).toBeTruthy();
  });

  it("marks only the current item for assistive tech", () => {
    render(<Nav label="Project" items={items} />);
    const current = screen.getByRole("link", { name: /Library/ });
    expect(current.getAttribute("aria-current")).toBe("page");
    const other = screen.getByRole("link", { name: "Overview" });
    expect(other.getAttribute("aria-current")).toBeNull();
  });

  it("shows an item's count beside its label", () => {
    render(<Nav label="Project" items={items} />);
    expect(screen.getByRole("link", { name: /Library/ }).textContent).toContain("20");
  });
});
