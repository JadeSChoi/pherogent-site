import { afterEach, describe, expect, it, vi } from "vitest";
import { exportBackup } from "../storage/backup";
import { createWorkspace } from "../storage/workspace";
import { apiFetch, clearOwnerKey, readOwnerKey, saveOwnerKey } from "./ownerKey";

const KEY = "owner-secret-fixture-0000";

describe("the owner key store", () => {
  afterEach(() => {
    clearOwnerKey();
    vi.unstubAllGlobals();
  });

  it("round-trips through session storage and clears on request", () => {
    expect(readOwnerKey()).toBeNull();
    saveOwnerKey(`  ${KEY}  `);
    expect(readOwnerKey()).toBe(KEY);
    clearOwnerKey();
    expect(readOwnerKey()).toBeNull();
  });

  it("treats a blank key as no key", () => {
    saveOwnerKey("   ");
    expect(readOwnerKey()).toBeNull();
  });

  it("returns null instead of throwing when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    });
    expect(readOwnerKey()).toBeNull();
    expect(() => saveOwnerKey(KEY)).not.toThrow();
    expect(() => clearOwnerKey()).not.toThrow();
  });

  it("never reaches a backup export: the key lives outside the workspace", () => {
    saveOwnerKey(KEY);
    expect(exportBackup(createWorkspace())).not.toContain(KEY);
  });
});

describe("apiFetch", () => {
  afterEach(() => {
    clearOwnerKey();
    vi.unstubAllGlobals();
  });

  it("attaches the owner key as an authorization header when one is saved", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    saveOwnerKey(KEY);
    await apiFetch("/api/agent/status");
    expect(fetchSpy).toHaveBeenCalledWith("/api/agent/status", {
      headers: { authorization: `Bearer ${KEY}` },
    });
  });

  it("merges the header into existing init without losing other headers", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    saveOwnerKey(KEY);
    await apiFetch("/api/check-claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/check-claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${KEY}`,
      },
      body: "{}",
    });
  });

  it("sends no authorization header when no key is saved", async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await apiFetch("/api/agent/status");
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.stringify(init ?? {})).not.toContain("authorization");
  });
});
