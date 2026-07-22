// Single source of truth for RBAC. Minimal but extensible by design —
// roles, tiers and capabilities are plain string unions plus a default
// role→capability matrix. The DB stores each user's staff role
// (profiles.role) and billing tier (profiles.tier); this module maps a
// role to what it may do.
//
// This WILL change often. To add a power: add it to CAPABILITIES, grant
// it in ROLE_CAPABILITIES. To add a role/tier: extend ROLES/TIERS. Later
// the matrix can move into a DB table (ADM-RBAC-2) without touching call
// sites — keep using can() / requireCapability().
//
// Two orthogonal axes on purpose:
//   • role  = STAFF capability (what you can do as team/staff)
//   • tier  = BILLING entitlement (priority/quotas; drives QUEUE-1)
// A person can be role="support" AND tier="corporate" at the same time.

export const ROLES = [
  "user",
  "tester",
  "support",
  "moderator",
  "admin",
  "superadmin",
] as const;
export type Role = (typeof ROLES)[number];

export const TIERS = ["regular", "pro", "corporate"] as const;
export type Tier = (typeof TIERS)[number];

export const DEFAULT_ROLE: Role = "user";
export const DEFAULT_TIER: Tier = "regular";

// Rank for "can't act on someone at or above your level" guards.
export const ROLE_RANK: Record<Role, number> = {
  user: 0,
  tester: 1,
  support: 2,
  moderator: 3,
  admin: 4,
  superadmin: 5,
};

// Granular powers checked at the server boundary. Keep names stable —
// endpoints reference them.
export const CAPABILITIES = [
  "users.view",
  "users.edit",
  "users.ban",
  "credits.grant",
  "roles.assign",
  "settings.edit",
  "pricing.edit",
  "keys.manage",
  "logs.view",
  "history.view_any",
  "impersonate",
  "stats.view",
  "templates.edit",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// Default role → capabilities. MINIMAL on purpose (it will be tuned a
// lot). superadmin is special-cased to "everything" in can().
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  user: [],
  tester: [],
  support: ["users.view", "credits.grant", "history.view_any", "logs.view", "stats.view"],
  moderator: [
    "users.view",
    "users.ban",
    "history.view_any",
    "logs.view",
    "stats.view",
    "templates.edit",
  ],
  admin: [
    "users.view",
    "users.edit",
    "users.ban",
    "credits.grant",
    "settings.edit",
    "pricing.edit",
    "keys.manage",
    "logs.view",
    "history.view_any",
    "impersonate",
    "stats.view",
    "templates.edit",
  ],
  superadmin: [...CAPABILITIES], // everything, incl. roles.assign
};

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}
export function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}
export function normalizeRole(v: unknown): Role {
  return isRole(v) ? v : DEFAULT_ROLE;
}
export function normalizeTier(v: unknown): Tier {
  return isTier(v) ? v : DEFAULT_TIER;
}

/** Does `role` hold `cap`? superadmin holds everything. */
export function can(role: Role, cap: Capability): boolean {
  if (role === "superadmin") return true;
  return (ROLE_CAPABILITIES[role] ?? []).includes(cap);
}

/** Is this a staff (non-customer) role? */
export function isStaffRole(role: Role): boolean {
  return role !== "user";
}
