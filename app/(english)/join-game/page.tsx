import JoinGamePage from "@/app/[lang]/join-game/page";
import { englishParams } from "../locale";

export default function EnglishJoinGamePage() {
  return JoinGamePage({ params: englishParams(), searchParams: Promise.resolve({}) });
}
