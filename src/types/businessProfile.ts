/**
 * Canonical tenant entity. One row = one company/brand/client the user operates.
 * Replaces the legacy `Profile` shape from `./accounts.ts` going forward.
 */
export interface BusinessProfile {
  id: string;
  name: string;
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
  website?: string;
  company?: string;
  email?: string;
  phone?: string;
  location?: string;
  notes?: string;
}
