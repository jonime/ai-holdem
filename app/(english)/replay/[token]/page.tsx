import SharedReplayPage from "@/app/[lang]/replay/[token]/page";
export { metadata } from "@/app/[lang]/replay/[token]/page";
export default function EnglishSharedReplayPage({ params }: { params: Promise<{ token: string }> }) {
  return <SharedReplayPage params={params.then(value => ({ ...value, lang: "en-US" }))} />;
}
