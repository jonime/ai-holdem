import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  "startRegion": "遊び方を選ぶ",
  "title": "AI Hold'em",
  "intro": "AIボットとテキサスホールデムで対戦したり、友達を招待したり、ボットの対戦を観戦したりできます。",
  "supportingCopy": "非公開の6席テーブルで5体のボットとすぐに対戦するか、自分のテーブルをカスタマイズしましょう。",
  "quickPlay": "AIとクイックプレイ",
  "play": "プレイ",
  "resources": "プロジェクト情報",
  "about": "このゲームについて",
  "developerResources": "開発者向け情報",
  "content": {
    "play": {
      "title": "AIとテキサスホールデムで対戦",
      "intro": "AI Hold’emは、AIプレイヤーと対戦できる無料のブラウザー版テキサスホールデムです。ページを開いてクイックプレイを選ぶだけで、非公開の6席テーブルで5体のボットとの対戦がすぐに始まります。ダウンロードや登録は不要です。仮想チップを使うため、実際のお金を賭けることも賞金を獲得することもありません。",
      "tables": "別の設定で遊びたい場合は、2〜6席のカスタムテーブルを作成してリンクを友達に共有できます。人間とボットが同じテーブルに参加することも、すべての席をボットで埋めて観戦することもできます。一人でボットと対戦する場合も、友達と遊ぶ場合も、カード、ベッティングラウンド、ポットはノーリミット・テキサスホールデムのルールに従います。"
    },
    "bots": {
      "title": "さまざまなボットと戦略",
      "description": "AI Hold’emは、計算したエクイティとポットオッズを使うルールベースのEquity Rules、TypeSafe System Oneでアクションを選ぶTypeSafe Jev、設定済みのLLMボットに対応しています。対戦できるボットはサイトの設定によって異なります。ボットごとに異なるアクションを選ぶことがあり、LLMボットはバランス型、タイト型、アグレッシブ型のプレイスタイルに沿って判断します。",
      "aboutLink": "ボットとAI Hold’emの仕組みについて詳しく見る"
    },
    "faq": {
      "title": "AI Hold’emのよくある質問",
      "items": {
        "free": {
          "question": "AI Hold’emは無料ですか？",
          "answer": "はい。登録不要で、ブラウザーから無料でプレイできます。"
        },
        "ai": {
          "question": "AIとテキサスホールデムで対戦できますか？",
          "answer": "はい。クイックプレイで、5体のAIボットとの非公開の対戦を始められます。"
        },
        "friends": {
          "question": "友達と遊べますか？",
          "answer": "はい。カスタムテーブルを作成してリンクを共有すると、友達が空席に参加できます。ボットを含めて2〜6人で遊べます。"
        },
        "money": {
          "question": "AI Hold’emは実際のお金を賭けるポーカーですか？",
          "answer": "いいえ。仮想チップを使い、実際のお金を賭けることも賞金を獲得することもありません。"
        }
      }
    }
  }
} satisfies LandingServerDictionary;

export default dictionary;
