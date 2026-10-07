import PlayPage, { generateMetadata as localizedMetadata } from "@/app/[lang]/play/page";
import { englishParams } from "../locale";

export function generateMetadata() {
  return localizedMetadata({ params: englishParams(), searchParams: Promise.resolve({}) });
}

export default function EnglishPlayPage() {
  return PlayPage({ params: englishParams(), searchParams: Promise.resolve({}) });
}
