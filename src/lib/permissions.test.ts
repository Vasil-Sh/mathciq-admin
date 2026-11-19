import { describe, expect, it } from "vitest";
import { canResetPassword, deleteBlockReason, roleLabel, roleLockReason } from "./permissions";

const owner = { username: "super_gus23_7482", isOwner: true };
const admin = { username: "admin", isOwner: false };
const otherAdmin = { username: "helper", isAdmin: true };
const player = { username: "Feeeder", isAdmin: false };

describe("owner vs admin rights", () => {
  it("an admin can delete users but not admins", () => {
    expect(deleteBlockReason(admin, player)).toBeNull();
    expect(deleteBlockReason(admin, otherAdmin)).toBe("Видаляти адміністраторів може лише овнер");
  });
  it("the owner can delete admins", () => {
    expect(deleteBlockReason(owner, otherAdmin)).toBeNull();
  });
  it("nobody can delete themselves (case-insensitive)", () => {
    expect(deleteBlockReason(owner, { username: "SUPER_gus23_7482", isAdmin: true })).toBe("Власний обліковий запис не можна видалити");
  });
  it("only the owner changes an admin's role", () => {
    expect(roleLockReason(admin, otherAdmin)).not.toBeNull();
    expect(roleLockReason(owner, otherAdmin)).toBeNull();
    expect(roleLockReason(admin, player)).toBeNull();
  });
  it("password reset: admin → users only; owner → anyone; everyone → self", () => {
    expect(canResetPassword(admin, player)).toBe(true);
    expect(canResetPassword(admin, otherAdmin)).toBe(false);
    expect(canResetPassword(owner, otherAdmin)).toBe(true);
    expect(canResetPassword(admin, { username: "admin", isAdmin: true })).toBe(true);
  });
  it("role labels", () => {
    expect(roleLabel({ isAdmin: true, isOwner: true })).toBe("Овнер");
    expect(roleLabel({ isAdmin: true })).toBe("Адміністратор");
    expect(roleLabel({ isAdmin: false })).toBe("Користувач");
  });
});
