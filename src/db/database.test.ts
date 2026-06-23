import { describe, it, expect } from "vitest";
import { initDb, getDb } from "./database";

describe("database module", () => {
  it("exports initDb as a function", () => {
    expect(typeof initDb).toBe("function");
  });

  it("exports getDb as a function", () => {
    expect(typeof getDb).toBe("function");
  });

  it("getDb throws before initialization", () => {
    expect(() => getDb()).toThrow("Database not initialized");
  });
});
