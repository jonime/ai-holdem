import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { POST as action } from "../action/route";
import { advanceTimeoutResponseSchema } from "@/lib/http/gameplay-contracts";
import { TurnTimerError } from "@/lib/poker/turn-timer";
import { BotStepForbiddenError } from "@/lib/poker/driver-authorization";
import { GameConflictError } from "@/lib/supabase/queries";
import { gameplayGame } from "@/test/fixtures/gameplay";
const { advance, submit, schedule } = vi.hoisted(() => ({ advance:vi.fn(),submit:vi.fn(),schedule:vi.fn() }));
vi.mock("@/lib/poker/game-service", async original => ({ ...await original<typeof import("@/lib/poker/game-service")>(),advanceTimeout:advance,submitHumanAction:submit }));
vi.mock("@/lib/supabase/server",()=>({createSupabaseGameRepository:()=>({})}));
vi.mock("@/lib/realtime/schedule",()=>({scheduleGameEvent:schedule}));
const context={params:Promise.resolve({gameId:"game-1"})};
const decisionId="00000000-0000-4000-8000-000000000001";
function request(body:unknown){return new Request("http://localhost/api/games/game-1/advance-timeout",{method:"POST",headers:{cookie:"ai-holdem-player-id=owner"},body:JSON.stringify(body)});}
beforeEach(()=>{vi.clearAllMocks();advance.mockResolvedValue(gameplayGame);});
describe("timeout HTTP boundary",()=>{
  it("returns a typed public envelope and schedules committed notifications",async()=>{
    const response=await POST(request({expectedVersion:2,decisionId}),context);
    expect(response.status).toBe(200);advanceTimeoutResponseSchema.parse(await response.json());
    expect(advance).toHaveBeenCalledWith({},"game-1",2,decisionId,"owner");
    expect(schedule).toHaveBeenCalledWith("game-1","player_action",2);
  });
  it.each([{expectedVersion:2},{expectedVersion:-1,decisionId},{expectedVersion:2,decisionId:"bad"},{expectedVersion:2,decisionId,actor:"other"}])("rejects invalid request %j",async body=>{
    expect((await POST(request(body),context)).status).toBe(400);expect(advance).not.toHaveBeenCalled();expect(schedule).not.toHaveBeenCalled();
  });
  it("returns early wait information and expired submissions without notifications",async()=>{
    advance.mockRejectedValue(new TurnTimerError("TURN_NOT_EXPIRED",321));
    const response=await POST(request({expectedVersion:2,decisionId}),context);
    expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:"TURN_NOT_EXPIRED",retryAfterMs:321});
    submit.mockRejectedValue(new TurnTimerError("TURN_EXPIRED"));
    expect(await (await action(request({expectedVersion:2,action:{type:"check"}}),context)).json()).toHaveProperty("code","TURN_EXPIRED");
    expect(schedule).not.toHaveBeenCalled();
  });
  it.each([new BotStepForbiddenError(),new GameConflictError("game-1",2)])("rejects unauthorized or stale requests",async error=>{
    advance.mockRejectedValue(error);const response=await POST(request({expectedVersion:2,decisionId}),context);
    expect(response.status).toBe(error instanceof BotStepForbiddenError?403:409);expect(schedule).not.toHaveBeenCalled();
  });
});
