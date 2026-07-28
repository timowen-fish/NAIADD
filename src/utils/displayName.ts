import type { UserProfile } from "../types/user";

export function getDisplayName(
  profile: Pick<UserProfile, "displayName" | "email">,
): string {
  if (profile.displayName?.trim()) {
    return profile.displayName.trim();
  }

  const username = (profile.email || "").split("@")[0];

  const formattedName = username
    .split(/[._-]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");

  return formattedName || "VADMA User";
}
