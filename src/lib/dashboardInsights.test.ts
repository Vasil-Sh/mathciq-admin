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

describe("parserHealth · stopped by hand", () => {
  it("a paused parser is not an alarm, even with an open breaker or a fresh failure", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(parserHealth({ name: "hltv_scraper", open: true, failures: 3, failures24h: 9, lastFailure: "2026-11-20T11:58:00Z", paused: true }, now)).toBe("ok");
    expect(parserHealth({ name: "hltv_scraper", open: true, failures: 3, failures24h: 9, lastFailure: "2026-11-20T11:58:00Z" }, now)).toBe("down");
  });
});
