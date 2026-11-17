import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select, TextArea, TextInput } from "./Field";

describe("TextInput", () => {
  it("associates the input with its label", () => {
    render(<TextInput label="Research question" />);
    const input = screen.getByLabelText("Research question");
    expect(input.tagName).toBe("INPUT");
  });

  it("wires an error to the input for assistive tech", () => {
    render(<TextInput label="DOI" error="Enter a DOI like 10.1038/s41586-020-2975-4" />);
    const input = screen.getByLabelText("DOI");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const error = document.getElementById(describedBy!);
    expect(error?.textContent).toBe("Enter a DOI like 10.1038/s41586-020-2975-4");
  });

  it("carries no error attributes when valid", () => {
    render(<TextInput label="Title" />);
    const input = screen.getByLabelText("Title");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });
});

describe("TextArea", () => {
  it("associates the textarea with its label and shows a hint", () => {
    render(<TextArea label="Research question" hint="Optional" rows={3} />);
    const area = screen.getByLabelText("Research question");
    expect(area.tagName).toBe("TEXTAREA");
    expect(screen.getByText("Optional")).toBeTruthy();
  });
});

describe("Select", () => {
  it("associates the select with its label and renders its options", () => {
    render(
      <Select label="Section" defaultValue="Evidence">
        <option>Library</option>
        <option>Evidence</option>
      </Select>,
    );
    const select = screen.getByLabelText("Section") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.options.length).toBe(2);
    expect(select.value).toBe("Evidence");
  });
});
