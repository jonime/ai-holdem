import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  "startRegion": "选择玩法",
  "title": "AI Hold'em",
  "intro": "与 AI 机器人玩德州扑克，邀请朋友，或观看机器人对局。",
  "supportingCopy": "在私密的六人牌桌上立即与五个机器人对战，或自定义你的牌桌。",
  "quickPlay": "快速对战 AI",
  "play": "开始游戏",
  "resources": "项目资源",
  "about": "关于",
  "developerResources": "开发者资源",
  "content": {
    "play": {
      "title": "与 AI 对手玩德州扑克",
      "intro": "AI Hold’em 是一款免费的浏览器德州扑克游戏，你可以与 AI 控制的玩家同桌对战。打开页面并选择快速游戏，即可在私密的六人牌桌上立即与五个机器人对战，无需下载或注册。游戏使用虚拟筹码，不涉及真钱下注或现金奖励。",
      "tables": "你也可以创建两到六个座位的自定义牌桌，并将链接分享给朋友。真人玩家和扑克机器人可以同桌游戏，也可以让机器人坐满牌桌并观看对局。无论独自与机器人对战还是邀请朋友，发牌、下注轮次和底池都遵循无限注德州扑克规则。"
    },
    "bots": {
      "title": "不同的扑克机器人，不同的策略",
      "description": "AI Hold’em 支持基于规则、利用计算出的胜率权益和底池赔率决策的 Equity Rules，通过 TypeSafe System One 选择行动的 TypeSafe Jev，以及已配置的大语言模型（LLM）扑克机器人。可用对手取决于网站配置。不同机器人可能选择不同的行动，LLM 机器人还可采用均衡、紧手或激进风格来指导决策。",
      "aboutLink": "了解机器人及 AI Hold’em 的运作方式"
    },
    "faq": {
      "title": "AI Hold’em 常见问题",
      "items": {
        "free": {
          "question": "AI Hold’em 免费吗？",
          "answer": "是的。AI Hold’em 可在浏览器中免费游玩，无需注册。"
        },
        "ai": {
          "question": "我可以与 AI 玩德州扑克吗？",
          "answer": "可以。快速游戏会开始一场与五个 AI 扑克机器人的私密对局。"
        },
        "friends": {
          "question": "我可以和朋友一起玩吗？",
          "answer": "可以。创建自定义牌桌并分享链接，朋友就能加入空位。牌桌支持两到六名玩家，包括机器人。"
        },
        "money": {
          "question": "AI Hold’em 是真钱扑克吗？",
          "answer": "不是。游戏使用虚拟筹码，不涉及真钱下注或现金奖励。"
        }
      }
    }
  }
} satisfies LandingServerDictionary;

export default dictionary;
