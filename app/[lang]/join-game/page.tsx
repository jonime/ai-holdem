import { notFound, permanentRedirect } from "next/navigation";
import { addLocalePrefix, hasLocale } from "@/lib/i18n";
export default async function JoinGamePage({ params }: PageProps<"/[lang]/join-game">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  permanentRedirect(addLocalePrefix("/play", lang));
}
