import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

/*
 * The design system specifies Aeonik, which is licensed and ships no font
 * files, so its own sanctioned substitutes are used: Inter for UI text and
 * JetBrains Mono for data. Both are self-hosted by next/font (no external
 * request at runtime, no layout shift). "Aeonik" still leads the stack in
 * globals.css — drop the licensed files in and it takes over on its own.
 */
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Product identity for the browser tab and social unfurls. The scaffold shipped
// "Lovable App" + a Lovable-hosted OG image here, so every shared link marketed
// the wrong product. No branded OG image asset exists yet — omitted rather than
// pointing at the wrong one; drop a real one in and add `images` back.
const DESCRIPTION =
  "Генерация рекламных креативов для iGaming: баннеры, лендинги, плейблы и видео — на базе ИИ.";

export const metadata: Metadata = {
  title: "Gen Go",
  description: DESCRIPTION,
  applicationName: "Gen Go",
  openGraph: {
    title: "Gen Go",
    description: DESCRIPTION,
    type: "website",
    siteName: "Gen Go",
  },
  twitter: {
    card: "summary",
    title: "Gen Go",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
