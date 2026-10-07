import LocaleLayout, { generateMetadata as localeMetadata } from "@/app/[lang]/layout";
import { englishParams } from "./locale";

export function generateMetadata(props: LayoutProps<"/">) {
  return localeMetadata({ ...props, params: englishParams() });
}

export default function EnglishLayout(props: LayoutProps<"/">) {
  return LocaleLayout({ ...props, params: englishParams() });
}
