import { describe, expect, it } from "vitest";
import { absLogo, betMatches, fromFeed, manualGroups, normTeam, teamsFrom, type FeedMatch } from "./matchesModel";
import { bet } from "@/test/factories";

const feed = (o: Partial<FeedMatch> = {}): FeedMatch => ({
  id: "1", date: "2026-11-20", link: "https://www.hltv.org/matches/1", type: "bo3", score1: null, score2: null,
  nameTeam1: "NAVI", nameTeam2: "FaZe", logoTeam1: "/api/v1/cs2-matches/logo/navi.png", logoTeam2: null,
  tournament: "IEM Chengdu", status: "upcoming", startDate: "2026-11-20T17:00:00Z", ...o,
});

describe("feed → match", () => {
  it("takes Kyiv day/time, status, source and an absolute logo", () => {
    const m = fromFeed(feed(), "cs2", "https://api.example.com/api");
    expect(m.time).toBe("19:00");
    expect(m.day).toBe("2026-11-20");
    expect(m.status).toBe("plan");
    expect(m.source).toBe("HLTV");
    expect(m.bo).toBe("BO3");
    expect(m.logo1).toBe("https://api.example.com/api/v1/cs2-matches/logo/navi.png");
    expect(fromFeed(feed({ status: "live", link: "https://tips.gg/x" }), "cs2", "x").source).toBe("tips.gg");
  });
  it("crosses midnight in Kyiv", () => {
    expect(fromFeed(feed({ startDate: "2026-11-20T22:30:00Z" }), "cs2", "x").day).toBe("2026-11-21");
  });
  it("keeps absolute and data logos as they are", () => {
    expect(absLogo("https://cdn/x.png", "x")).toBe("https://cdn/x.png");
    expect(absLogo(null, "x")).toBeNull();
  });
});

describe("team names and bets", () => {
  it("normalises spelling", () => {
    expect(normTeam("Team Spirit")).toBe(normTeam("spirit"));
    expect(normTeam("NaVi")).toBe(normTeam("NAVI"));
  });
  it("matches a bet to a match by both teams in any order, ±1 day", () => {
    const m = fromFeed(feed(), "cs2", "x");
    expect(betMatches(bet({ team1: "FaZe", team2: "NaVi", date: "2026-11-20" }), m)).toBe(true);
    expect(betMatches(bet({ team1: "NaVi", team2: "G2", date: "2026-11-20" }), m)).toBe(false);
    expect(betMatches(bet({ team1: "NaVi", team2: "FaZe", date: "2026-11-15" }), m)).toBe(false);
    expect(betMatches(bet({ team1: "", team2: "", match: "Експрес 3x" }), m)).toBe(false);
  });
});

describe("matches added by hand", () => {
  it("groups bets that are not in the feeds and finds the closest official match", () => {
    const m = fromFeed(feed({ nameTeam1: "NAVI", nameTeam2: "G2" }), "cs2", "x");
    const bets = [
      { ...bet({ id: "a", team1: "Navi", team2: "G2 Esports", date: "2026-11-18" }), username: "maksym_k" },
      { ...bet({ id: "b", team1: "G2 Esports", team2: "Navi", date: "2026-11-18" }), username: "iryna" },
      { ...bet({ id: "c", team1: "NAVI", team2: "G2", date: "2026-11-20" }), username: "dota_pro" }, // is in the feed
    ];
    const g = manualGroups(bets, [m]);
    expect(g).toHaveLength(1);
    expect(g[0].bets.map((b) => b.id)).toEqual(["a", "b"]);
    expect(g[0].official?.id).toBe(m.id);
  });
});

describe("teams", () => {
  it("counts matches per team and keeps other spellings", () => {
    const a = fromFeed(feed({ id: "1", nameTeam1: "NAVI", nameTeam2: "FaZe" }), "cs2", "x");
    const b = fromFeed(feed({ id: "2", nameTeam1: "NaVi", nameTeam2: "G2" }), "cs2", "x");
    const t = teamsFrom([a, b]);
    const navi = t.find((x) => normTeam(x.name) === "navi")!;
    expect(navi.matches).toBe(2);
    expect(navi.variants).toHaveLength(1);
  });
});
