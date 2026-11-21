// Draws a main category's picture (migration 0042). Always shown beside the
// category's name, so the picture itself is hidden from screen readers.
import {
  AirVent,
  Archive,
  BookOpen,
  Briefcase,
  Building2,
  Car,
  CookingPot,
  Droplets,
  Dumbbell,
  HeartPulse,
  Lightbulb,
  MonitorSpeaker,
  MoonStar,
  Package,
  Shapes,
  ShieldCheck,
  Shovel,
  Sofa,
  SprayCan,
  Tv,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { isCategoryIcon, type CategoryIconKey } from "@/lib/categories/icons";

const ICONS: Record<CategoryIconKey, LucideIcon> = {
  furniture: Sofa,
  electronics: MonitorSpeaker,
  heating: AirVent,
  building: Building2,
  kitchen: CookingPot,
  garden: Shovel,
  vehicles: Car,
  prayer: MoonStar,
  supplies: Package,
  tools: Wrench,
  safety: ShieldCheck,
  lighting: Lightbulb,
  books: BookOpen,
  sports: Dumbbell,
  medical: HeartPulse,
  office: Briefcase,
  cleaning: SprayCan,
  water: Droplets,
  screens: Tv,
  storage: Archive,
  other: Shapes,
};

export function CategoryIcon({ icon, size = 24, className }: { icon: string | null | undefined; size?: number; className?: string }) {
  const Icon = ICONS[isCategoryIcon(icon) ? icon : "other"];
  return <Icon aria-hidden size={size} strokeWidth={1.75} className={className} />;
}

/** A round green badge holding the picture, for tiles and page headings. */
export function CategoryBadge({ icon, size = "md" }: { icon: string | null | undefined; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : "h-11 w-11";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-icci-green-50 text-icci-green-dark`}>
      <CategoryIcon icon={icon} size={size === "lg" ? 28 : 22} />
    </span>
  );
}
