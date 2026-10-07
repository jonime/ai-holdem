import { POST as localizedPost } from "@/app/[lang]/new-game/route";
import { DEFAULT_LOCALE } from "@/lib/i18n";

export function POST(request: Request) {
  return localizedPost(request, { params: Promise.resolve({ lang: DEFAULT_LOCALE }) });
}
