import "server-only";

import type { PlayDictionary } from "../../types";

const dictionary = {
  collections: "游戏列表",
  sharedHands: "已分享的牌局",
  emptyPersonal: "还没有牌桌。请使用上方的快速游戏或创建牌桌，或浏览公开牌桌。",
  emptyShares: "没有有效的分享。可在已结束牌局的回放中分享。",
  shareOwnership: "此列表与本浏览器的匿名 Cookie 关联。换用其他浏览器或清除 Cookie 后将无法访问此列表。",
  viewShare: "查看",
  shareHand: "第 {hand} 手 · {id}",
  shareCreated: "创建于 {date}",
  newTab: "在新标签页中打开",
  sharedError: "无法加载已分享的牌局。",
  shareRecoveryFailed: "请先刷新列表，再管理其他链接。",
  shareUncertain: "操作结果不确定。请检查刷新后的列表，再作决定。",
  loadMore: "加载更多",

  "title": "开始游戏",
  "intro": "返回你的牌桌，或寻找有空位的公开牌桌。",
  "quickPlay": "快速对战 AI",
  "createTable": "创建牌桌",
    cancel: "取消",
    removing: "正在移除…",
    refreshList: "刷新列表",
    removalUncertain: "结果尚不确定。列表已刷新；请查看后再决定是否操作。",
    removalRecoveryFailed: "结果尚不确定，且无法刷新列表。请先刷新列表再重试。",
    noLongerListed: "此牌桌已不在你的列表中。这并不能证明牌桌已被永久删除。",
    removalOperationChanged: "可用操作已更改。请关闭此对话框，并从更新后的列表中重新选择。",
  "deleteTable": "删除牌桌",
  "leaveAndRemove": "离开并移除",
  removeFromList: "从我的牌桌中移除",
  confirmRemove: "要从你的牌桌列表中移除“{title}”吗？其他玩家仍可访问牌桌及其历史。如果你已入座，将会离开：等待中或牌局结束后的座位立即释放。牌局中的离开不可撤销，你将在下一个合法回合弃牌。全下玩家保留赢得底池的资格。",
  "deleteBlocked": "仍有其他真人玩家占用座位。他们必须先释放座位，你才能删除此牌桌。",
  "confirmDelete": "永久删除“{title}”？牌桌、历史记录和共享链接将被永久删除。",
  "confirmLeave": "离开并移除“{title}”？一手牌进行中时，离开不可撤销。等待中或已结束的座位会立即释放；正在参与的玩家会在下一个合法行动时弃牌。已全下的玩家仍有资格赢取底池。 共享牌桌及其历史记录仍可供其他玩家使用。",
  "removalConflict": "牌桌状态已更改。请查看刷新后的列表并手动重试。",
  "removalFailed": "无法移除牌桌。请重试。",
  "yourTables": "你的牌桌",
  "returnToTable": "返回牌桌",
  "personalError": "无法加载你的牌桌。",
  "retry": "重试",
  "publicTables": "有空位的公开牌桌",
  "refreshing": "正在刷新…",
  tableWithBots: "有机器人的牌桌",
  pokerTable: "扑克牌桌",
  you: "你",
  otherPlayers: {"zero": "其他玩家{count}人", "one": "其他玩家{count}人", "two": "其他玩家{count}人", "few": "其他玩家{count}人", "many": "其他玩家{count}人", "other": "其他玩家{count}人"},
  players: {"zero": "玩家{count}人", "one": "玩家{count}人", "two": "玩家{count}人", "few": "玩家{count}人", "many": "玩家{count}人", "other": "玩家{count}人"},
  bots: {"zero": "机器人{count}个", "one": "机器人{count}个", "two": "机器人{count}个", "few": "机器人{count}个", "many": "机器人{count}个", "other": "机器人{count}个"},
  updated: "更新于{time}",
  updatedJustNow: "刚刚更新",
  "fallbackTitle": "牌桌 {id}",
  "seats": "{occupied}/{total} 个座位",
  "statuses": {
    "waiting": "等待中",
    "playing": "游戏中",
    "complete": "本手结束",
    "error": "错误"
  }
} satisfies PlayDictionary;

export default dictionary;
