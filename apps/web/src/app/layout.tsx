import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-latin", subsets: ["latin"] });
const notoBengali = Noto_Sans_Bengali({
  variable: "--font-noto-bengali",
  subsets: ["bengali"],
  // Do not hold up the first paint for the font: use the phone's own Bangla font on the very first visit.
  display: "optional",
});

export const metadata: Metadata = {
  title: "upay Compass",
  description: "Understand your money. Save with confidence.",
  appleWebApp: { capable: true, title: "Compass", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // light by default; lib/theme.ts updates this when the user picks another theme
  themeColor: "#f4f6fa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // the theme script sets the .dark class before hydration, hence the warning opt-out
    <html
      lang="bn"
      suppressHydrationWarning
      className={`${jakarta.variable} ${notoBengali.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
