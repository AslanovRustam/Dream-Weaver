import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Providers } from "./providers";

const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e6965c32-536c-42f6-b3a1-39ebabffba82/id-preview-e561ceb0--ceb6de31-fc7c-43c6-abf0-df9f5110ead5.lovable.app-1778570053835.png";

export const metadata: Metadata = {
  title: "Lovable App",
  description: "Dream Weaver Studio generates images from text prompts using AI models.",
  authors: [{ name: "Lovable" }],
  openGraph: {
    title: "Lovable App",
    description: "Dream Weaver Studio generates images from text prompts using AI models.",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary",
    site: "@Lovable",
    title: "Lovable App",
    description: "Dream Weaver Studio generates images from text prompts using AI models.",
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
