import "server-only";

import type { JoinGameDictionary } from "../../types";

const dictionary = {
  "turnTimer": "人間の持ち時間：{duration}",
  "timerOff": "オフ",
  "timerDuration": "{seconds}秒",
  "title": "ゲームに参加",
  "intro": "ホストが待機中の公開テーブルを選んでください。",
  "back": "戻る",
  "playerName": "名前（任意）",
  "namePlaceholder": "プレイヤー名",
  "refresh": "更新",
  "refreshing": "更新中…",
  "empty": "現在、参加できる公開テーブルはありません。",
  "retry": "再試行",
  "warning": "空席状況を更新できませんでした。前回取得したテーブルを表示しています。",
  "initialError": "公開テーブルを読み込めませんでした。",
  "join": "参加",
  "joining": "参加中…",
  "loadMore": "もっと見る",
  "loadingMore": "読み込み中…",
  "unavailable": "このテーブルには参加できなくなりました。一覧を更新しました。",
  "conflict": "テーブルの状態が変わりました。更新された一覧を確認して、もう一度お試しください。",
  "seats": "{occupied}/{total}席",
  "people": "人間 {humans}人 · ボット {bots}体",
  "blinds": "ブラインド {small}/{big}",
  "stack": "開始チップ {stack}",
  "fallbackTitle": "テーブル {id}"
} satisfies JoinGameDictionary;

export default dictionary;
