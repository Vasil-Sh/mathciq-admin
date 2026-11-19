import { describe, expect, it } from "vitest";
import { deltaVs } from "./paymentsModel";

describe("change vs last month (always %)", () => {
  it("normal growth and drop", () => {
    expect(deltaVs(150, 100).d).toBe(50);
    expect(deltaVs(50, 100).d).toBe(-50);
  });
  it("from 0 to something is +100%, 0 → 0 is 0%", () => {
    expect(deltaVs(225, 0).d).toBe(100);
    expect(deltaVs(0, 0).d).toBe(0);
  });
  it("rounds to one decimal", () => {
    expect(deltaVs(4, 3).d).toBe(33.3);
  });
});
