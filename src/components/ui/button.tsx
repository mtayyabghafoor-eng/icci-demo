// Buttons and button-looking links (UI-PLAN 5.5). Every button is at least
// 44 px tall. An icon is always beside a word; an icon-only button must be
// be given a hidden label with aria-label.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/ui/text";

export type ButtonKind = "primary" | "secondary" | "outline" | "danger" | "ghost";
export type ButtonSize = "md" | "lg";

const KIND: Record<ButtonKind, string> = {
  primary: "bg-icci-green-dark text-white! hover:bg-icci-green-900 shadow-sm",
  secondary: "bg-icci-green text-white! hover:bg-icci-green-dark shadow-sm",
  outline: "border border-icci-green/40 bg-white text-icci-green! hover:border-icci-green hover:bg-icci-green-50",
  danger: "border border-icci-error/50 bg-white text-icci-error! hover:border-icci-error hover:bg-[#fbe7e5]",
  ghost: "text-icci-green! hover:bg-icci-green-50",
};

const SIZE: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-[15px] gap-2",
  lg: "min-h-12 px-6 text-base gap-2.5",
};

export function buttonClass(kind: ButtonKind = "primary", size: ButtonSize = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center rounded-[10px] font-semibold no-underline transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:opacity-50",
    KIND[kind],
    SIZE[size],
    extra,
  );
}

type Common = { kind?: ButtonKind; size?: ButtonSize; icon?: LucideIcon; iconAfter?: LucideIcon; children?: ReactNode };

function Inner({ icon: Icon, iconAfter: After, children }: Common) {
  return (
    <>
      {Icon && <Icon aria-hidden size={18} strokeWidth={2} className="shrink-0" />}
      {children}
      {After && <After aria-hidden size={18} strokeWidth={2} className="shrink-0" />}
    </>
  );
}

export function Button({ kind, size, icon, iconAfter, children, className, type = "button", ...rest }: Common & ComponentProps<"button">) {
  return (
    <button type={type} className={buttonClass(kind, size, className)} {...rest}>
      <Inner icon={icon} iconAfter={iconAfter}>{children}</Inner>
    </button>
  );
}

export function LinkButton({ kind, size, icon, iconAfter, children, className, ...rest }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(kind, size, className)} {...rest}>
      <Inner icon={icon} iconAfter={iconAfter}>{children}</Inner>
    </Link>
  );
}
