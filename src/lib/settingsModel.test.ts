import { describe, expect, it } from "vitest";
import { agoText, changedKeys, closestVar, DEFAULT_DRAFT, describeChange, deviceName, fillTemplate, generatePassword, passwordStrength, templateParts, unknownVar } from "./settingsModel";

describe("settings draft", () => {
  it("lists only changed keys and describes them", () => {
    const b = { ...DEFAULT_DRAFT, trialDays: 7, aiStopWords: ["ставте"] };
    const a = { ...DEFAULT_DRAFT, trialDays: 5, aiStopWords: ["ставте"] };
    expect(changedKeys(a, b)).toEqual(["trialDays"]);
    expect(describeChange("trialDays", a, b)).toBe("пробний період 5 → 7 днів");
    expect(describeChange("receiptSupport", { ...a, receiptSupport: "@cs2beet" }, { ...b, receiptSupport: "@matchiq_help" })).toBe("Telegram у чеку @cs2beet → @matchiq_help");
  });
});

describe("templates", () => {
  it("splits variables and finds unknown ones", () => {
    expect(templateParts("Привіт, {логін}!")).toEqual([{ t: "Привіт, " }, { t: "{логін}", v: true }, { t: "!" }]);
    expect(unknownVar("до {дата}")).toBe("{дата}");
    expect(unknownVar("до {дата_закінчення}")).toBeNull();
    expect(closestVar("{дата}")).toBe("{дата_закінчення}");
  });
  it("fills values", () => {
    expect(fillTemplate("{логін}: {тариф} — {сума}, до {дата_закінчення}, {днів_без_ставок}", { login: "maksym_k", plan: "Базову", amount: "300 ₴", endDate: "10.11.2026", idleDays: 9 }))
      .toBe("maksym_k: Базову — 300 ₴, до 10.11.2026, 9");
  });
});

describe("account helpers", () => {
  it("names devices", () => {
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36").name).toBe("Chrome · Windows");
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17 Mobile Safari/604.1")).toEqual({ name: "Safari · iPhone", phone: true });
    expect(deviceName("").name).toBe("Невідомий пристрій");
  });
  it("says how long ago", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(agoText("2026-11-20T11:58:00Z", now)).toBe("зараз");
    expect(agoText("2026-11-20T10:00:00Z", now)).toBe("2 год тому");
    expect(agoText("2026-11-14T12:00:00Z", now)).toBe("6 днів тому");
  });
  it("rates passwords and generates strong ones", () => {
    expect(passwordStrength("qwerty").label).toBe("Слабкий");
    expect(passwordStrength("matchiq2026").score).toBeLessThan(3);
    expect(passwordStrength("Kx7-pq9Lm2zR").label).toBe("Надійний");
    for (let i = 0; i < 20; i++) expect(passwordStrength(generatePassword()).label).toBe("Надійний");
  });
});
