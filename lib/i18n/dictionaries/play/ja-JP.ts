import "server-only";

import type { PlayDictionary } from "../../types";

const dictionary = {
  "title": "プレイ",
  "intro": "自分のテーブルに戻るか、空席のある公開テーブルを探しましょう。",
  "quickPlay": "AIとクイックプレイ",
  "createTable": "テーブルを作成",
  "deleteTable": "テーブルを削除",
  "leaveAndRemove": "退出して一覧から削除",
  removeFromList: "自分のテーブル一覧から削除",
  confirmRemove: "「{title}」を自分のテーブル一覧から削除しますか？テーブルと履歴は他のプレイヤーに引き続き表示されます。着席中の場合は退出します。待機中またはハンド終了後は席がすぐに空きます。ハンド中の退出は取り消せず、次の合法なターンでフォールドします。オールインしたプレイヤーはポットを受け取る資格を維持します。",
  "deleteBlocked": "他の人間プレイヤーがまだ着席しています。全員が席を離れるまで、このテーブルは削除できません。",
  "confirmDelete": "「{title}」を削除しますか？履歴と共有URLは完全に削除されます。",
  "confirmLeave": "「{title}」から退出して一覧から削除しますか？ハンド中の退出は取り消せません。待機中またはハンド終了後はすぐに席が解放され、プレイ中は次に可能なターンでフォールドします。オールインしたプレイヤーはポットを獲得する権利を維持します。",
  "removalConflict": "テーブルの状態が変わりました。更新された一覧を確認し、再試行してください。",
  "removalFailed": "テーブルを削除できませんでした。もう一度お試しください。",
  "yourTables": "自分のテーブル",
  "returnToTable": "テーブルに戻る",
  "personalError": "自分のテーブルを読み込めませんでした。",
  "retry": "再試行",
  "publicTables": "空席のある公開テーブル",
  "refreshing": "更新中…",
  "loadingPersonal": "自分のテーブルを読み込み中…",
  "loadingPublic": "公開テーブルを読み込み中…",
  "fallbackTitle": "テーブル {id}",
  "seats": "{occupied}/{total}席",
  "statuses": {
    "waiting": "待機中",
    "playing": "プレイ中",
    "complete": "ハンド終了",
    "error": "エラー"
  }
} satisfies PlayDictionary;

export default dictionary;
