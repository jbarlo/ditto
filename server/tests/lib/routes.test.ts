import { describe, it, expect } from "vitest";
import { route } from "@/lib/routes";

describe("route", () => {
  it("returns static routes as-is", () => {
    expect(route("/home")).toBe("/home");
    expect(route("/")).toBe("/");
    expect(route("/login")).toBe("/login");
  });

  it("substitutes a single param", () => {
    expect(route("/canvas/:canvasId", { canvasId: "abc" })).toBe("/canvas/abc");
    expect(route("/frame/:name", { name: "my-frame" })).toBe("/frame/my-frame");
    expect(route("/invite/:token", { token: "xyz" })).toBe("/invite/xyz");
  });

  // Type-level tests — these don't run, they just need to compile.
  // If any @ts-expect-error stops being an error, tsc will fail.
  it.skip("type errors", () => {
    // @ts-expect-error — missing required params
    route("/canvas/:canvasId");

    // @ts-expect-error — wrong param name
    route("/canvas/:canvasId", { wrong: "abc" });

    // @ts-expect-error — unknown route
    route("/nonexistent");

    // @ts-expect-error — extra params on static route
    route("/home", { extra: "bad" });

    // @ts-expect-error — extra property alongside correct one
    route("/canvas/:canvasId", { canvasId: "abc", extra: "bad" });
  });
});
