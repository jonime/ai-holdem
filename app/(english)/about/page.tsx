import AboutPage, { generateMetadata as localizedMetadata } from "@/app/[lang]/about/page";
import { englishParams } from "../locale";

export function generateMetadata() {
  return localizedMetadata({ params: englishParams() });
}

export default function EnglishAboutPage() {
  return AboutPage({ params: englishParams() });
}
