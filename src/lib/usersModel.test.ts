import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterFromParam, matches, statusOf, statusUi, tagOf } from "./usersModel";
import { user } from "@/test/factories";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-19T12:00:00+02:00")); });
afterEach(() => vi.useRealTimers());

describe("status and badges", () => {
  it("the owner gets a red «Овнер» badge, a plain admin keeps «Адмін»", () => {
    const owner = user({ role: "admin", isOwner: true });
    expect(statusUi(owner)).toEqual({ label: "Овнер", cls: "v3-st-owner" });
    expect(tagOf(owner).label).toBe("Овнер");
    expect(statusUi(user({ role: "admin" })).label).toBe("Адмін");
  });

  it("ending soon / urgent / ended by days left", () => {
    expect(statusOf(user({ endDate: "2026-12-30" }))).toBe("active");
    expect(statusOf(user({ endDate: "2026-11-25" }))).toBe("soon");
    expect(statusOf(user({ endDate: "2026-11-20" }))).toBe("urgent");
    expect(statusOf(user({ endDate: "2026-11-10" }))).toBe("ended");
  });

  it("self-limited users are blocked", () => {
    expect(statusOf(user({ selfLimitedUntil: "2026-12-01" } as never))).toBe("blocked");
  });
});

describe("filters", () => {
  it("«Закінчуються» catches subscriptions ending within 7 days", () => {
    expect(matches(user({ endDate: "2026-11-24" }), "expiring")).toBe(true);
    expect(matches(user({ endDate: "2026-12-30" }), "expiring")).toBe(false);
  });
  it("admins are never counted as paid", () => {
    expect(matches(user({ role: "admin", plan: "pro" }), "paid")).toBe(false);
    expect(matches(user({ plan: "pro", endDate: "2026-12-30" }), "paid")).toBe(true);
  });
});

describe("links from other screens (?status=)", () => {
  it("known filters pass through", () => {
    expect(filterFromParam("trial")).toBe("trial");
    expect(filterFromParam("expiring")).toBe("expiring");
    expect(filterFromParam("all")).toBe("all");
  });
  it("older links still work", () => {
    expect(filterFromParam("active")).toBe("paid");
    expect(filterFromParam("expired")).toBe("closed");
  });
  it("nothing or junk → no filter (screen opens on «Усі»)", () => {
    expect(filterFromParam(null)).toBeNull();
    expect(filterFromParam("whatever")).toBeNull();
  });
});
