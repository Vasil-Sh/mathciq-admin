import { describe as group, expect, it } from "vitest";
import { describe, type Entry } from "./auditModel";

const entry = (o: Partial<Entry>): Entry => ({
  id: "1", actor_name: "admin", action: "PATCH", target: "/auth/users/5", details: {}, status: "success", created_at: "2026-11-19T10:00:00Z", ...o,
});

group("journal sentences", () => {
  it("payment record deleted", () => {
    const v = describe(entry({ action: "DELETE", target: "/admin/payments/1", details: { targetUsername: "Ter", amount: 300 } }));
    expect(v.kind).toBe("pay");
    expect(v.verb).toBe("видалив запис оплати");
    expect(v.target).toBe("№1 · @Ter");
  });

  it("only end/start date changed → «продовжив підписку» (grouped)", () => {
    const v = describe(entry({ details: { targetUsername: "Gerrry", _changes: { endDate: { before: "2026-11-24", after: "2026-12-24" } } } }));
    expect(v.verb).toBe("продовжив підписку");
    expect(v.groupKey).toBeTruthy();
    expect(v.userId).toBe("5");
  });

  it("other profile edits → «оновив користувача»", () => {
    const v = describe(entry({ details: { targetUsername: "Feeeder", _changes: { telegram: { before: "a", after: "b" } } } }));
    expect(v.verb).toBe("оновив користувача");
    expect(v.target).toBe("@Feeeder");
  });

  it("sign-out everywhere counts devices", () => {
    expect(describe(entry({ action: "POST", target: "/auth/logout-all", details: { revoked: 54 } })).target).toBe("на 54 пристроях");
  });

  it("password reset never shows the password", () => {
    const v = describe(entry({ action: "POST", target: "/auth/users/5/reset-password", details: { targetUsername: "x", password: "secret" } }));
    expect(v.kind).toBe("key");
    expect(JSON.stringify(v)).not.toContain("secret");
  });
});
