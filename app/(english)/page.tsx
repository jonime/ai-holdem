import Home from "@/app/[lang]/page";
import { englishParams } from "./locale";

export default function EnglishHome() {
  return Home({ params: englishParams(), searchParams: Promise.resolve({}) });
}
