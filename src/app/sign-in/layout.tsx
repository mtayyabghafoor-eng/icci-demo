import Image from "next/image";
import { Logo } from "@/components/ui";

// The sign-in screens (docs/UI-PLAN.md 5.1): on a PC one card in the middle,
// the Centre photograph with a dark green wash on the left and the form on
// white on the right. On a phone the photograph becomes a band at the top.
// The round logo sits on the dark green wash (owner decision 15 Nov 2026).
export default function SignInLayout({ children }: LayoutProps<"/sign-in">) {
  return (
    <main className="flex flex-1 items-stretch justify-center bg-white md:items-center md:bg-transparent md:px-6 md:py-10">
      <div className="flex w-full max-w-5xl flex-col overflow-hidden bg-white md:min-h-[600px] md:flex-row md:rounded-3xl md:border md:border-icci-gold-300 md:shadow-raised">
        <section
          aria-label="Islamic Cultural Centre of Ireland"
          className="icci-pattern relative flex h-56 shrink-0 flex-col items-center justify-end overflow-hidden px-6 pb-6 text-center text-white md:h-auto md:w-[46%] md:justify-center md:pb-0"
        >
          <Image
            src="/brand/centre-front-1800.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 460px, 100vw"
            className="-z-20 object-cover object-[60%_40%]"
          />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-icci-green-dark/55 via-icci-green-dark/72 to-icci-green-900/92" />
          <span className="md:hidden">
            <Logo size={72} priority />
          </span>
          <span className="hidden md:block">
            <Logo size={150} priority />
          </span>
          <p className="page-title mt-3 text-[26px] text-white! md:mt-6 md:text-[38px]">Islamic Cultural Centre of Ireland</p>
          <p className="mt-1 text-[15px] text-[#e9e1cf] md:mt-2">Control Dashboard</p>
          <div aria-hidden className="mx-auto mt-6 hidden h-px w-24 bg-icci-gold md:block" />
        </section>

        <div className="flex flex-1 flex-col justify-center px-5 py-8 md:px-14 md:py-12">
          <div className="mx-auto w-full max-w-sm">{children}</div>
          <p className="mx-auto mt-10 max-w-sm text-center text-[13px] text-icci-ink-60">
            For ICCI administrators and the library volunteer only.
            {/* Owner, 22 Nov 2026: no "made up" note on the online demo; it stays on development. */}
            {process.env.ICCI_ENVIRONMENT === "development" ? " All data in this prototype is made up." : ""}
          </p>
        </div>
      </div>
    </main>
  );
}
