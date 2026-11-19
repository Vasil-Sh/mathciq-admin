import { describe, expect, it } from "vitest";
import { betView, gameLabel, money, nativeAmount, nativeProfit, signedMoney, signedPct, statsFor, usdStatsFor } from "./betsModel";
import { bet, user } from "@/test/factories";

const plain = (s: string) => s.replace(/[  ]/g, " "); // uk-UA groups thousands with a no-break space

describe("money / signs", () => {
  it("formats ₴ and $ with the right sign", () => {
    expect(plain(money(8451))).toBe("8 451 ₴");
    expect(plain(signedMoney(-1176))).toBe("−1 176 ₴");
    expect(plain(signedMoney(33, "USD"))).toBe("+33 $");
    expect(signedMoney(0)).toBe("0 ₴");
    expect(signedPct(-67.7)).toBe("−67,7%");
  });
});

describe("dollar bets are shown in dollars", () => {
  // The app saves a $ bet with amount/profit converted to ₴ and the dollars in original*
  const usd = bet({ currency: "USD", amount: 4513, profit: 1489.29, originalAmount: 100, originalProfit: 33, exchangeRate: 41.5 });

  it("uses the dollars as entered, not the ₴ equivalent", () => {
    expect(nativeAmount(usd)).toBe(100);
    expect(nativeProfit(usd)).toBe(33);
    const v = betView(usd);
    expect(plain(v.amount)).toBe("100 $");
    expect(plain(v.profit)).toBe("+33 $");
  });

  it("older $ records without original* fall back to ₴ ÷ rate", () => {
    const old = bet({ currency: "USD", amount: 4150, profit: 415, exchangeRate: 41.5, originalAmount: null, originalProfit: null });
    expect(nativeAmount(old)).toBe(100);
    expect(nativeProfit(old)).toBe(10);
  });

  it("₴ bets are untouched", () => {
    const uah = bet({ amount: 222, profit: -222, result: "Loss" });
    expect(nativeAmount(uah)).toBe(222);
    expect(plain(betView(uah).profit)).toBe("−222 ₴");
  });

  it("a pending bet has no profit yet", () => {
    expect(betView(bet({ result: "Pending", profit: 0 })).profit).toBe("—");
  });
});

describe("per-game totals", () => {
  const u = user({
    betCount: 10, wins: 5, losses: 5, totalStaked: 2880, totalProfit: -1116, roi: -38.75, winRate: 50,
    usdBets: 1, usdStaked: 100, usdProfit: 33,
    games: [
      { game: "cs2", bets: 6, wins: 3, losses: 3, pending: 0, staked: 1400, profit: -200, usdBets: 1, usdStaked: 100, usdProfit: 33 },
      { game: "dota2", bets: 4, wins: 2, losses: 2, pending: 0, staked: 1480, profit: -916, usdBets: 0, usdStaked: 0, usdProfit: 0 },
    ] as never,
  });

  it("normalises game names", () => {
    expect(gameLabel("cs2")).toBe("CS2");
    expect(gameLabel("CS 2")).toBe("CS2");
    expect(gameLabel("dota2")).toBe("Dota 2");
  });

  it("₴ stats per tab", () => {
    expect(statsFor(u, "all").profit).toBe(-1116);
    const cs = statsFor(u, "CS2");
    expect(cs.bets).toBe(6);
    expect(cs.profit).toBe(-200);
    expect(cs.wr).toBe(50);
  });

  it("$ stats follow the tab and disappear where there are no $ bets", () => {
    expect(usdStatsFor(u, "all")).toEqual({ bets: 1, staked: 100, profit: 33, roi: 33 });
    expect(usdStatsFor(u, "CS2")?.profit).toBe(33);
    expect(usdStatsFor(u, "Dota 2")).toBeNull();
    expect(usdStatsFor(user(), "all")).toBeNull();
  });
});
