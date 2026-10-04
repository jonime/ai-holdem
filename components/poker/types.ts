import type {
  AIDifficulty,
  LegalAction,
  PublicPokerGame,
  PublicPokerPlayer,
  BotPlaystyleId,
} from "@/lib/poker/types";

export type { LegalAction, PublicPokerGame, PublicPokerPlayer };
export type { AIDifficulty, BotPlaystyleId };
export type { TableSettings } from "@/lib/http/gameplay-contracts";
export type { BotDescriptor } from "@/lib/http/creation-contracts";

export type { GameplayGame as Game, GameplayAIDecision as AIDecision } from "@/lib/http/gameplay-contracts";

export type { HandActionHistoryItem, CompletedAIDecisionInspection, HandHistory, GameFeedEvent, GameFeed } from "@/lib/http/history-contracts";
import type { HandActionHistoryItem } from "@/lib/http/history-contracts";
export type LatestPlayerAction = Pick<HandActionHistoryItem, "action" | "amount">;
