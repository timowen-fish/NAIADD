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
    name: "Orangefoot Pimpleback",
    description:
      "A rare Clinch River mussel named for the striking orange tissue visible around its shell.",
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
    name: "James Spinymussel",
    description:
      "A Virginia native whose young shells have tiny spines that usually disappear with age.",
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
    name: "Cumberland Moccasinshell",
    description:
      "A compact Appalachian mussel that lives in clean, flowing rivers with gravel and cobble bottoms.",
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
    name: "Snuffbox",
    description:
      "This small, thick-shelled mussel earned its name from its resemblance to an old-fashioned snuff box.",
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
    name: "Brook Floater",
    description:
      "A stream-dwelling mussel found in Virginia's James and Potomac river basins.",
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
    name: "Green Floater",
    description:
      "Unlike most freshwater mussels, this little green species may not always need a fish host to reproduce.",
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
    name: "Purple Wartyback",
    description:
      "Its wonderfully blunt name describes a rounded shell covered in bumps, often hiding vivid purple nacre.",
    appearance: "dark",
    preview: {
      background: "#120d08",
      panel: "#3e2a1c",
      accent: "#f28c28",
      secondary: "#4fc3a1",
      text: "#fff8ed",
    },
  },
  {
    id: "american-shad",
    name: "Dwarf Wedgemussel",
    description:
      "One of Virginia's smallest native mussels, with adults often measuring less than two inches long.",
    appearance: "dark",
    preview: {
      background: "#07121b",
      panel: "#274151",
      accent: "#8fd3ff",
      secondary: "#d8e3ea",
      text: "#f4fbff",
    },
  },
  {
    id: "bowfin",
    name: "Eastern Hellbender",
    description:
      "Virginia's largest aquatic salamander spends nearly its entire life beneath rocks in cool, clean rivers.",
    appearance: "dark",
    preview: {
      background: "#091109",
      panel: "#314333",
      accent: "#a6c36f",
      secondary: "#d18b47",
      text: "#f7f9ed",
    },
  },
  {
    id: "walleye",
    name: "Spiny Riversnail",
    description:
      "A large river snail whose shell may carry dramatic knobs or spines along its outer ridge.",
    appearance: "dark",
    preview: {
      background: "#0b1013",
      panel: "#374246",
      accent: "#d5c95d",
      secondary: "#8aa5b2",
      text: "#fbfae9",
    },
  },
  {
    id: "plain-jane",
    name: "Plain Jane",
    description:
      "An intentionally minimal Microsoft-style interface with flat white panels, gray borders, and blue controls.",
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
