import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TypeSafe AI Hold'em",
  description: "A structured TypeSafe AI poker decision demo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
