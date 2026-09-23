import type { Metadata } from "next";

import { APP_NAME } from "@/lib/constants";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A structured TypeSafe AI poker decision demo.",
  icons: {
    icon: "/ai-holdem-logo.png",
    shortcut: "/ai-holdem-logo.png",
    apple: "/ai-holdem-logo.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: APP_NAME,
    description: "A structured TypeSafe AI poker decision demo.",
    images: [{ url: "/ai-holdem-logo.png", alt: "AI Hold'em logo" }],
  },
  twitter: {
    card: "summary",
    title: APP_NAME,
    description: "A structured TypeSafe AI poker decision demo.",
    images: ["/ai-holdem-logo.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
