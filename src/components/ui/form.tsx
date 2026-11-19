// Form fields (UI-PLAN 5.5): label above, help below in grey, error below in
// red with an icon. Inputs are 44 px tall on a PC and 48 px on a phone.
import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/ui/text";

const CONTROL =
  "block w-full rounded-xl border bg-white px-3.5 text-base text-icci-text placeholder:text-icci-ink-60/70 " +
  "transition-colors duration-150 focus:border-icci-green focus:outline-3 focus:outline-offset-2 focus:outline-icci-focus";

const controlClass = (invalid?: boolean, extra?: string) =>
  cx(CONTROL, invalid ? "border-icci-error" : "border-[#c9d3cf] hover:border-icci-green/60", extra);

export function Field({
  id,
  label,
  help,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  help?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
        {optional && <span className="font-normal text-icci-ink-60"> (optional)</span>}
      </label>
      {children}
      {help && !error && (
        <p id={`${id}-help`} className="text-sm text-icci-ink-60">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-sm font-semibold text-icci-error" role="alert">
          <CircleAlert aria-hidden size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

type Invalid = { invalid?: boolean };

export function Input({ invalid, className, ...rest }: Invalid & ComponentProps<"input">) {
  return <input aria-invalid={invalid || undefined} className={controlClass(invalid, cx("min-h-12 md:min-h-11", className))} {...rest} />;
}

export function Select({ invalid, className, children, ...rest }: Invalid & ComponentProps<"select">) {
  return (
    <select aria-invalid={invalid || undefined} className={controlClass(invalid, cx("min-h-12 md:min-h-11 pr-9", className))} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ invalid, className, ...rest }: Invalid & ComponentProps<"textarea">) {
  return <textarea aria-invalid={invalid || undefined} className={controlClass(invalid, cx("min-h-28 py-3", className))} {...rest} />;
}
