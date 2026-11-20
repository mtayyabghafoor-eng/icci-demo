import type { Metadata } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { DemoBanner } from "@/components/shell/demo-banner";
import "./globals.css";

// Fonts are bundled with the site at build time; visitors' browsers never contact Google.
// Titles: Cormorant Garamond (serif, Title Case, 28 px and larger only).
// Everything else: Plus Jakarta Sans. Label numbers and codes: JetBrains Mono.
const title = Cormorant_Garamond({ variable: "--font-title", subsets: ["latin"], weight: ["500", "600", "700"] });
const body = Plus_Jakarta_Sans({ variable: "--font-body", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ICCI Control Dashboard",
  description: "Admin dashboard for the Islamic Cultural Centre of Ireland",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${title.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
