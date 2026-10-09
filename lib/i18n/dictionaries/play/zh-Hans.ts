import "server-only";

import type { PlayDictionary } from "../../types";

const dictionary = {
  "title": "开始游戏",
  "intro": "返回你的牌桌，或寻找有空位的公开牌桌。",
  "quickPlay": "快速对战 AI",
  "createTable": "创建牌桌",
  "deleteTable": "删除牌桌",
  "leaveAndRemove": "离开并移除",
  "deleteBlocked": "仍有其他真人玩家占用座位。他们必须先释放座位，你才能删除此牌桌。",
  "confirmDelete": "删除“{title}”？其历史记录和共享链接将被永久删除。",
  "confirmLeave": "离开并移除“{title}”？一手牌进行中时，离开不可撤销。等待中或已结束的座位会立即释放；正在参与的玩家会在下一个合法行动时弃牌。已全下的玩家仍有资格赢取底池。",
  "removalConflict": "牌桌状态已更改。请查看刷新后的列表并手动重试。",
  "removalFailed": "无法移除牌桌。请重试。",
  "yourTables": "你的牌桌",
  "returnToTable": "返回牌桌",
  "personalError": "无法加载你的牌桌。",
  "retry": "重试",
  "publicTables": "有空位的公开牌桌",
  "refreshing": "正在刷新…",
  "loadingPersonal": "正在加载你的牌桌…",
  "loadingPublic": "正在加载公开牌桌…",
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
