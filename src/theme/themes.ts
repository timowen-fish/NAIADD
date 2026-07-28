export const VADMA_THEME_IDS = [
  "standard",
  "blackbanded-sunfish",
  "red-drum",
  "striped-bass",
  "bluespotted-sunfish",
  "largemouth-bass",
  "pumpkinseed",
  "american-shad",
  "bowfin",
  "walleye",
  "plain-jane",
] as const;

export type VadmaThemeId = (typeof VADMA_THEME_IDS)[number];

export type VadmaThemeDefinition = {
  id: VadmaThemeId;
  name: string;
  description: string;
  appearance: "dark" | "light";
  preview: {
    background: string;
    panel: string;
    accent: string;
    secondary: string;
    text: string;
  };
};

export const DEFAULT_VADMA_THEME: VadmaThemeId = "standard";

export const VADMA_THEMES: readonly VadmaThemeDefinition[] = [
  {
    id: "standard",
    name: "Standard",
    description:
      "The familiar VADMA charcoal interface with warm orange accents.",
    appearance: "dark",
    preview: {
      background: "#111418",
      panel: "#242932",
      accent: "#ff9f43",
      secondary: "#ffd29a",
      text: "#f8fafc",
    },
  },
  {
    id: "blackbanded-sunfish",
    name: "Blackbanded Sunfish",
    description:
      "Blackbanded sunfish favor quiet, heavily vegetated water and are among Virginia’s smallest sunfishes.",
    appearance: "dark",
    preview: {
      background: "#080b0f",
      panel: "#141a20",
      accent: "#f59e0b",
      secondary: "#4f8fa8",
      text: "#f8fafc",
    },
  },
  {
    id: "red-drum",
    name: "Red Drum",
    description:
      "Red drum can make a croaking sound by vibrating muscles against their swim bladder.",
    appearance: "dark",
    preview: {
      background: "#0b1118",
      panel: "#20252b",
      accent: "#c56735",
      secondary: "#d9a06f",
      text: "#fff8f2",
    },
  },
  {
    id: "striped-bass",
    name: "Striped Bass",
    description:
      "Striped bass move between fresh and salt water and may travel hundreds of miles during migration.",
    appearance: "dark",
    preview: {
      background: "#111827",
      panel: "#273444",
      accent: "#cbd5e1",
      secondary: "#7ea4bf",
      text: "#f8fafc",
    },
  },
  {
    id: "bluespotted-sunfish",
    name: "Bluespotted Sunfish",
    description:
      "Male bluespotted sunfish display brilliant iridescent blue spots during courtship.",
    appearance: "dark",
    preview: {
      background: "#071521",
      panel: "#102b3b",
      accent: "#38bdf8",
      secondary: "#67e8f9",
      text: "#f0f9ff",
    },
  },
  {
    id: "largemouth-bass",
    name: "Largemouth Bass",
    description:
      "Largemouth bass can swallow prey that is nearly half their own body length.",
    appearance: "dark",
    preview: {
      background: "#0b140d",
      panel: "#1c2b1f",
      accent: "#84a94f",
      secondary: "#c3d59b",
      text: "#f7faef",
    },
  },
  {
    id: "pumpkinseed",
    name: "Pumpkinseed",
    description:
      "Pumpkinseed use strong jaws and specialized teeth to crush snails and other hard-shelled prey.",
    appearance: "dark",
    preview: {
      background: "#15100b",
      panel: "#35251a",
      accent: "#f28c28",
      secondary: "#4fc3a1",
      text: "#fff8ed",
    },
  },
  {
    id: "american-shad",
    name: "American Shad",
    description:
      "American shad return from the ocean to spawn in the same rivers where they were born.",
    appearance: "dark",
    preview: {
      background: "#0b1620",
      panel: "#203443",
      accent: "#8fd3ff",
      secondary: "#d8e3ea",
      text: "#f4fbff",
    },
  },
  {
    id: "bowfin",
    name: "Bowfin",
    description:
      "Bowfin can gulp air at the surface, helping them survive in warm, oxygen-poor water.",
    appearance: "dark",
    preview: {
      background: "#0d150f",
      panel: "#26362a",
      accent: "#a6c36f",
      secondary: "#d18b47",
      text: "#f7f9ed",
    },
  },
  {
    id: "walleye",
    name: "Walleye",
    description:
      "Walleye have reflective eyes that help them hunt efficiently in dim or murky water.",
    appearance: "dark",
    preview: {
      background: "#11161a",
      panel: "#2a3337",
      accent: "#d5c95d",
      secondary: "#8aa5b2",
      text: "#fbfae9",
    },
  },
  {
    id: "plain-jane",
    name: "Plain Jane",
    description:
      "A clean, flat, light interface for users who prefer a traditional office-software look.",
    appearance: "light",
    preview: {
      background: "#f3f3f3",
      panel: "#ffffff",
      accent: "#0067b8",
      secondary: "#dbeafe",
      text: "#1f1f1f",
    },
  },
] as const;

export function isVadmaThemeId(value: unknown): value is VadmaThemeId {
  return (
    typeof value === "string" &&
    (VADMA_THEME_IDS as readonly string[]).includes(value)
  );
}

export function getVadmaTheme(themeId: VadmaThemeId): VadmaThemeDefinition {
  return (
    VADMA_THEMES.find((theme) => theme.id === themeId) ?? VADMA_THEMES[0]
  );
}
