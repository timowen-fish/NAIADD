import type { FieldValue, Timestamp } from "firebase/firestore";

export type UserRole =
  | "admin"
  | "power_user"
  | "biologist"
  | "technician"
  | "viewer";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  power_user: "Power User",
  biologist: "Biologist",
  technician: "Technician",
  viewer: "Viewer",
};

export const USER_ROLES: readonly UserRole[] = [
  "admin",
  "power_user",
  "biologist",
  "technician",
  "viewer",
];

export type FirestoreDate =
  | Timestamp
  | FieldValue
  | Date
  | string
  | number
  | null
  | undefined;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  lastLoginAt: FirestoreDate;
}

export type UserProfileUpdate = Pick<
  UserProfile,
  "displayName" | "role" | "active"
>;
