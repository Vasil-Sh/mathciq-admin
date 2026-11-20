import { describe, expect, it } from "vitest";
import { parserHealth, type ParserState } from "./dashboardInsights";

const NOW = Date.parse("2026-11-20T10:55:00Z");
const p = (o: Partial<ParserState>): ParserState => ({ name: "tipsgg_fetch_cs2_matches", open: false, failures: 0, failures24h: 0, lastFailure: "", ...o });

describe("parser health", () => {
  it("breaker open → down", () => {
    expect(parserHealth(p({ open: true }), NOW)).toBe("down");
  });
  it("closed, but failed minutes ago → flaky (not «Працює»)", () => {
    expect(parserHealth(p({ failures: 2, failures24h: 23, lastFailure: "2026-11-20T10:51:00Z" }), NOW)).toBe("flaky");
  });
  it("last failure long ago → ok", () => {
    expect(parserHealth(p({ failures24h: 3, lastFailure: "2026-11-20T08:00:00Z" }), NOW)).toBe("ok");
    expect(parserHealth(p({}), NOW)).toBe("ok");
  });
});
