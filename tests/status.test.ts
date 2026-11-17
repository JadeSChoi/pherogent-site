import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/status", () => {
  it("reports the service up with the schema version read from D1", async () => {
    const response = await SELF.fetch("https://example.com/api/status");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "pherogent",
      schemaVersion: "0001",
    });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const response = await SELF.fetch("https://example.com/api/nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "not_found" });
  });
});
