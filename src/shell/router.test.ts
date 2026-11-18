import { describe, expect, it } from "vitest";
import { pathFor, routeFromPath, ROUTES } from "./router";

describe("routeFromPath", () => {
  it("maps each destination's path to its route", () => {
    expect(routeFromPath("/")).toBe("overview");
    expect(routeFromPath("/library")).toBe("library");
    expect(routeFromPath("/manuscript")).toBe("manuscript");
    expect(routeFromPath("/chat")).toBe("chat");
    expect(routeFromPath("/usage")).toBe("usage");
  });

  it("falls back to overview for unknown paths", () => {
    expect(routeFromPath("/nowhere")).toBe("overview");
    expect(routeFromPath("")).toBe("overview");
  });

  it("ignores trailing slashes", () => {
    expect(routeFromPath("/library/")).toBe("library");
    expect(routeFromPath("/manuscript//")).toBe("manuscript");
  });

  it("round-trips every route through its path", () => {
    for (const route of ROUTES) {
      expect(routeFromPath(pathFor(route))).toBe(route);
    }
  });
});
