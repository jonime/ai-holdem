import "server-only";

import type { JoinGameDictionary } from "../../types";

const dictionary = {
  "turnTimer": "真人行动时限：{duration}",
  "timerOff": "关闭",
  "timerDuration": "{seconds} 秒",
  "title": "加入游戏",
  "intro": "选择有在线房主的公开牌桌。",
  "back": "返回",
  "playerName": "你的名字（可选）",
  "namePlaceholder": "玩家名字",
  "refresh": "刷新",
  "refreshing": "正在刷新…",
  "empty": "目前没有可加入的公开牌桌。",
  "retry": "重试",
  "warning": "无法刷新牌桌状态。正在显示上次获取的牌桌。",
  "initialError": "无法加载公开牌桌。",
  "join": "加入",
  "joining": "正在加入…",
  "loadMore": "加载更多",
  "loadingMore": "正在加载…",
  "unavailable": "该牌桌已不可加入。列表已刷新。",
  "conflict": "牌桌状态已更改。请查看刷新后的列表并重试。",
  "seats": "{occupied}/{total} 个座位",
  "people": "{humans} 名真人 · {bots} 个机器人",
  "blinds": "盲注 {small}/{big}",
  "stack": "起始筹码 {stack}",
  "fallbackTitle": "牌桌 {id}"
} satisfies JoinGameDictionary;

export default dictionary;
