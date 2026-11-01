// Mirrors the backend rules (cs-backend/src/services/ownerRules.ts) so the UI
// can hide or explain actions up front. The backend is still the authority.
//
//   owner — admin who may also delete/demote admins, reset their passwords
//           and appoint other owners.
//   admin — create admins, promote users, edit any account, delete users.

export interface Actor { username: string; isOwner: boolean }
export interface Target { username: string; isAdmin: boolean; isOwner?: boolean }

export const isSelf = (target: Pick<Target, "username">, actor?: Pick<Actor, "username"> | null) =>
  !!actor?.username && String(target.username).toLowerCase() === actor.username.toLowerCase();

/** Why this account cannot be deleted, or null if it can. */
export function deleteBlockReason(actor: Actor | null, target: Target): string | null {
  if (isSelf(target, actor)) return "Власний обліковий запис не можна видалити";
  if (target.isAdmin && !actor?.isOwner) return "Видаляти адміністраторів може лише власник";
  return null;
}

/** Why the role select is locked, or null if the role can be changed. */
export function roleLockReason(actor: Actor | null, target: Target): string | null {
  if (isSelf(target, actor)) return "Це ваш обліковий запис — власну роль змінити не можна.";
  if (target.isAdmin && !actor?.isOwner) return "Змінювати роль адміністратора може лише власник.";
  return null;
}

export function canResetPassword(actor: Actor | null, target: Target): boolean {
  return !target.isAdmin || isSelf(target, actor) || !!actor?.isOwner;
}

export const roleLabel = (t: Pick<Target, "isAdmin" | "isOwner">) =>
  t.isOwner ? "Власник" : t.isAdmin ? "Адміністратор" : "Користувач";
