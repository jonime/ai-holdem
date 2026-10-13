import type { ReactNode } from "react";

export { metadata } from "@/app/[lang]/game/[gameId]/layout";

export default function EnglishGameLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
