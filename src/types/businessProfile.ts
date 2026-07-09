/**
 * Profile type: a user can run several profiles in the same app — one per
 * company/brand/client plus a personal one for their private life. Only
 * affects labels, icons and AI defaults; multi-tenant behaviour is identical.
 */
export type ProfileKind = "company" | "personal";

/**
 * Canonical tenant entity. One row = one company/brand/client (or the user's
 * personal space). Replaces the legacy `Profile` shape from `./accounts.ts`
 * going forward.
 */
export interface BusinessProfile {
  id: string;
  name: string;
  kind: ProfileKind;
  orgNumber?: string;
  website?: string;
  company?: string;
  email?: string;
  phone?: string;
  location?: string;
  notes?: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt?: string;
}

export type MembershipRole = "owner" | "admin" | "editor" | "viewer";

export interface Membership {
  userId: string;
  businessProfileId: string;
  role: MembershipRole;
  createdAt: string;
}

export interface BusinessProfileInput {
  name: string;
  kind?: ProfileKind;
  orgNumber?: string;
  website?: string;
  company?: string;
  email?: string;
  phone?: string;
  location?: string;
  notes?: string;
}
