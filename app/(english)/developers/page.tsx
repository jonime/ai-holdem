import DevelopersPage, { generateMetadata as localizedMetadata } from "@/app/[lang]/developers/page";
import { englishParams } from "../locale";

export function generateMetadata() {
  return localizedMetadata({ params: englishParams() });
}

export default function EnglishDevelopersPage() {
  return DevelopersPage({ params: englishParams() });
}
