import PlayPage, { generateMetadata as localizedMetadata } from "@/app/[lang]/play/page";
import { englishParams } from "../locale";

export const instant = false;

export function generateMetadata() {
  return localizedMetadata({ params: englishParams(), searchParams: Promise.resolve({}) });
}

export default function EnglishPlayPage({ searchParams }: PageProps<"/play">) {
  return PlayPage({ params: englishParams(), searchParams });
}
