import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { healthyStatus } from "./statusFixture";
import { UsageMeterPanel } from "./UsageMeterPanel";

const renderPanel = (body: unknown, status = 200) =>
  render(
    <UsageMeterPanel
      fetchImpl={vi.fn(async () => Response.json(body, { status }))}
    />,
  );

const group = async (name: string) =>
  within(await screen.findByRole("group", { name }));

describe("UsageMeterPanel", () => {
  it("renders reported tokens, estimated cost, and remaining allowances from the status endpoint", async () => {
    renderPanel(healthyStatus());

    const reported = await group("Reported usage");
    expect(reported.getByText("12,340")).toBeTruthy();
    expect(reported.getByText("10,000")).toBeTruthy();
    expect(reported.getByText("2,340")).toBeTruthy();
    expect(reported.getByText("$0.0412")).toBeTruthy();

    const allowance = await group("Remaining allowance");
    expect(allowance.getByText("$0.80 of $1.00")).toBeTruthy();
    expect(allowance.getByText("$9.50 of $10.00")).toBeTruthy();
    expect(allowance.getByText("1,800,000 of 2,000,000")).toBeTruthy();
    expect(allowance.getByText("2 of 3")).toBeTruthy();
  });

  it("shows reservations in their own group, marked as holds rather than charges", async () => {
    renderPanel(healthyStatus());

    const reservations = await group("Reservations held");
    expect(reservations.getByText("$0.20")).toBeTruthy();
    expect(reservations.getByText("$0.50")).toBeTruthy();
    expect(reservations.getByText("200,000 tokens")).toBeTruthy();
    expect(
      screen.getByText(/Reservations are holds against the allowance, not charges/),
    ).toBeTruthy();
    expect(
      screen.getByText(/reserves 40,000 tokens and \$0\.10 before it starts/),
    ).toBeTruthy();
  });

  it("groups thousands in dollar figures", async () => {
    const status = healthyStatus();
    status.limits.lifetimeUsd = 1000;
    status.budget.remainingLifetimeUsd = 999.1;
    renderPanel(status);

    const allowance = await group("Remaining allowance");
    expect(allowance.getByText("$999.10 of $1,000.00")).toBeTruthy();
  });

  it("displays the prices-last-verified date as information", async () => {
    renderPanel(healthyStatus());

    expect(
      await screen.findByText(/Prices behind the estimates last verified 2026-11-17/),
    ).toBeTruthy();
  });

  it("flags unresolved runs as a caution that totals may understate billed usage", async () => {
    const status = healthyStatus();
    status.usage.unknownCalls = 2;
    renderPanel(status);

    const reported = await group("Reported usage");
    expect(
      reported.getByText(
        "2 runs never reported their usage. The totals above exclude them and may understate what was billed.",
      ),
    ).toBeTruthy();
  });

  it("cautions when the server could not confirm whether every run reported", async () => {
    const status = healthyStatus();
    status.usage.unknownCalls = "nope" as never;
    renderPanel(status);

    const reported = await group("Reported usage");
    expect(
      reported.getByText(
        "The server could not confirm that every run reported its usage. The totals above may understate what was billed.",
      ),
    ).toBeTruthy();
  });

  it("renders a null ledger as labeled unknowns, never as zero", async () => {
    renderPanel(
      {
        ...healthyStatus(),
        enabled: false,
        canRun: false,
        reason: "owner_key_required",
        message: "AI runs on this deployment require the owner access key.",
        budget: null,
        usage: null,
      },
      503,
    );

    const reported = await group("Reported usage");
    expect(reported.getAllByText("Not reported").length).toBe(5);
    expect(reported.queryByText("0")).toBeNull();
    expect(reported.queryByText("$0.0000")).toBeNull();

    const allowance = await group("Remaining allowance");
    expect(allowance.getAllByText("Unconfirmed").length).toBe(4);

    expect(
      screen.getByText("AI runs on this deployment require the owner access key."),
    ).toBeTruthy();
    expect(
      screen.getByText(/Prices behind the estimates last verified 2026-11-17/),
    ).toBeTruthy();
  });

  it("renders no figures at all when the endpoint cannot be reached", async () => {
    render(
      <UsageMeterPanel
        fetchImpl={vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        })}
      />,
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("offers no illustrative demo mode", async () => {
    renderPanel(healthyStatus());

    await screen.findByText("12,340");
    expect(screen.queryByText(/demo/i)).toBeNull();
    expect(screen.queryByText(/illustrative/i)).toBeNull();
  });
});
