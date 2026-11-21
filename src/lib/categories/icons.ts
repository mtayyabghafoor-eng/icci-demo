// The pictures a main category can have (migration 0042), with a plain
// word for each so the picker can be read without the picture. The screen
// draws each as a Lucide icon (src/app/(app)/categories/icon.tsx).
export const CATEGORY_ICON_WORDS = {
  furniture: "Furniture",
  electronics: "Electronics and sound",
  heating: "Heating and cooling",
  building: "Building and security",
  kitchen: "Kitchen",
  garden: "Garden",
  vehicles: "Vehicles",
  prayer: "Prayer",
  supplies: "Supplies",
  tools: "Tools",
  safety: "Safety",
  lighting: "Lighting",
  books: "Books",
  sports: "Sports",
  medical: "Medical",
  office: "Office",
  cleaning: "Cleaning",
  water: "Water",
  screens: "Screens",
  storage: "Storage",
  other: "Other",
} as const;

export type CategoryIconKey = keyof typeof CATEGORY_ICON_WORDS;

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICON_WORDS) as CategoryIconKey[];

export function isCategoryIcon(v: unknown): v is CategoryIconKey {
  return typeof v === "string" && v in CATEGORY_ICON_WORDS;
}
