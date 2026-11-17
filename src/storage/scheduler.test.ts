import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWriteScheduler } from "./scheduler";

describe("createWriteScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes immediately on the first schedule, then at most once per interval", () => {
    const write = vi.fn();
    const scheduler = createWriteScheduler(write, 1000);

    scheduler.schedule();
    expect(write).toHaveBeenCalledTimes(1);

    // A typing burst inside the interval produces one trailing write.
    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(2);

    // Quiet afterwards: no further writes.
    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("flush writes pending work immediately", () => {
    const write = vi.fn();
    const scheduler = createWriteScheduler(write, 1000);
    scheduler.schedule();
    scheduler.schedule();
    expect(write).toHaveBeenCalledTimes(1);

    scheduler.flush();
    expect(write).toHaveBeenCalledTimes(2);

    // Nothing pending: flush is a no-op.
    scheduler.flush();
    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("dispose cancels pending work without writing", () => {
    const write = vi.fn();
    const scheduler = createWriteScheduler(write, 1000);
    scheduler.schedule();
    scheduler.schedule();
    scheduler.dispose();
    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
