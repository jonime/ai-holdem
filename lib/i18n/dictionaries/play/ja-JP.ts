import "server-only";

import type { PlayDictionary } from "../../types";

const dictionary = {
  collections: "プレイ一覧",
  sharedHands: "共有したハンド",
  emptyPersonal: "テーブルはまだありません。上のクイックプレイやテーブル作成を使うか、公開テーブルをご覧ください。",
  emptyShares: "有効な共有ハンドはありません。終了したハンドのリプレイから共有できます。",
  shareOwnership: "この一覧は、このブラウザーの匿名 Cookie に紐づいています。別のブラウザーや Cookie の削除後はアクセスできません。",
  viewShare: "見る",
  shareHand: "ハンド {hand} · {id}",
  shareCreated: "作成日時 {date}",
  newTab: "新しいタブで開きます",
  sharedError: "共有したハンドを読み込めませんでした。",
  shareRecoveryFailed: "他のリンクを管理する前に一覧を更新してください。",
  shareUncertain: "結果を確認できません。一覧を確認してからもう一度判断してください。",
  loadMore: "さらに読み込む",

  "title": "プレイ",
  "intro": "自分のテーブルに戻るか、空席のある公開テーブルを探しましょう。",
  "quickPlay": "AIとクイックプレイ",
  "createTable": "テーブルを作成",
    cancel: "キャンセル",
    removing: "削除中…",
    refreshList: "一覧を更新",
    removalUncertain: "結果を確認できません。一覧を更新しました。再度操作する前に確認してください。",
    removalRecoveryFailed: "結果を確認できず、一覧も更新できませんでした。再試行する前に一覧を更新してください。",
    noLongerListed: "このテーブルは一覧にありません。テーブルの完全削除が確認されたわけではありません。",
    removalOperationChanged: "利用可能な操作が変わりました。このダイアログを閉じ、更新された一覧から選択してください。",
  "deleteTable": "テーブルを削除",
  "leaveAndRemove": "退出して一覧から削除",
  removeFromList: "自分のテーブル一覧から削除",
  confirmRemove: "「{title}」を自分のテーブル一覧から削除しますか？テーブルと履歴は他のプレイヤーに引き続き表示されます。着席中の場合は退出します。待機中またはハンド終了後は席がすぐに空きます。ハンド中の退出は取り消せず、次の合法なターンでフォールドします。オールインしたプレイヤーはポットを受け取る資格を維持します。",
  "deleteBlocked": "他の人間プレイヤーがまだ着席しています。全員が席を離れるまで、このテーブルは削除できません。",
  "confirmDelete": "「{title}」を完全に削除しますか？テーブル、履歴、共有URLは完全に削除されます。",
  "confirmLeave": "「{title}」から退出して一覧から削除しますか？ハンド中の退出は取り消せません。待機中またはハンド終了後はすぐに席が解放され、プレイ中は次に可能なターンでフォールドします。オールインしたプレイヤーはポットを獲得する権利を維持します。 共有テーブルと履歴は、他のプレイヤーが引き続き利用できます。",
  "removalConflict": "テーブルの状態が変わりました。更新された一覧を確認し、再試行してください。",
  "removalFailed": "テーブルを削除できませんでした。もう一度お試しください。",
  "yourTables": "自分のテーブル",
  "returnToTable": "テーブルに戻る",
  "personalError": "自分のテーブルを読み込めませんでした。",
  "retry": "再試行",
  "publicTables": "空席のある公開テーブル",
  "refreshing": "更新中…",
  tableWithBots: "ボットと対戦するテーブル",
  pokerTable: "ポーカーテーブル",
  you: "あなた",
  otherPlayers: {"zero": "他のプレイヤー{count}人", "one": "他のプレイヤー{count}人", "two": "他のプレイヤー{count}人", "few": "他のプレイヤー{count}人", "many": "他のプレイヤー{count}人", "other": "他のプレイヤー{count}人"},
  players: {"zero": "プレイヤー{count}人", "one": "プレイヤー{count}人", "two": "プレイヤー{count}人", "few": "プレイヤー{count}人", "many": "プレイヤー{count}人", "other": "プレイヤー{count}人"},
  bots: {"zero": "ボット{count}体", "one": "ボット{count}体", "two": "ボット{count}体", "few": "ボット{count}体", "many": "ボット{count}体", "other": "ボット{count}体"},
  updated: "更新：{time}",
  updatedJustNow: "たった今更新",
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
