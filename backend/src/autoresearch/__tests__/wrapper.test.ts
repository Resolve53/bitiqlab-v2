import { describe, expect, it, vi, beforeEach } from "vitest";
import { StrategyGenerator } from "@/autoresearch/wrapper";
import { SUBMIT_EXECUTABLE_STRATEGY_TOOL } from "@/lib/claude-strategy-schema";
import {
  validDualStrategy,
  validLongStrategy,
  validShortStrategy,
} from "@/lib/__tests__/strategy-gen-fixtures";

function mockClientReturning(payload: unknown) {
  return {
    beta: {
      tools: {
        messages: {
          create: vi.fn(async () => ({
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: "toolu_test",
                name: SUBMIT_EXECUTABLE_STRATEGY_TOOL.name,
                input: payload,
              },
            ],
          })),
        },
      },
    },
  };
}

describe("StrategyGenerator (no stub {})", () => {
  it("never returns empty object — requires tool entries", async () => {
    const client = mockClientReturning({});
    const gen = new StrategyGenerator("test-key", { client: client as any });
    await expect(
      gen.generate({
        prompt: "long rsi",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
      })
    ).rejects.toThrow(/null\/empty entries|omitted/i);
  });

  it("generates valid LONG structured strategy from tool input", async () => {
    const payload = validLongStrategy();
    const client = mockClientReturning(payload);
    const gen = new StrategyGenerator("test-key", { client: client as any });
    const result = await gen.generate({
      prompt: "long when RSI(14)<30",
      symbol: "BTCUSDT",
      timeframe: "1h",
      market_type: "spot",
    });
    expect(result.entries[0].direction).toBe("long");
    expect(result.stop_loss_percent).toBe(2);
    expect(result.risk_per_trade_pct).toBe(1.5);
    expect(client.beta.tools.messages.create).toHaveBeenCalled();
    const calls = client.beta.tools.messages.create.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const callArg = calls[0][0] as { tools: Array<{ name: string }> };
    expect(callArg.tools[0].name).toBe(SUBMIT_EXECUTABLE_STRATEGY_TOOL.name);
  });

  it("generates valid SHORT", async () => {
    const gen = new StrategyGenerator("k", {
      client: mockClientReturning(validShortStrategy()) as any,
    });
    const result = await gen.generate({
      prompt: "short",
      symbol: "ETHUSDT",
      timeframe: "15m",
      market_type: "spot",
    });
    expect(result.entries[0].direction).toBe("short");
  });

  it("generates valid LONG + SHORT", async () => {
    const gen = new StrategyGenerator("k", {
      client: mockClientReturning(validDualStrategy()) as any,
    });
    const result = await gen.generate({
      prompt: "dual",
      symbol: "SOLUSDT",
      timeframe: "4h",
      market_type: "spot",
    });
    expect(result.entries.map((e) => e.direction)).toEqual(["long", "short"]);
  });

  it("rejects response without tool_use", async () => {
    const client = {
      beta: {
        tools: {
          messages: {
            create: vi.fn(async () => ({
              stop_reason: "end_turn",
              content: [{ type: "text", text: "here is prose" }],
            })),
          },
        },
      },
    };
    const gen = new StrategyGenerator("k", { client: client as any });
    await expect(
      gen.generate({
        prompt: "x",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
      })
    ).rejects.toThrow(/did not call/);
  });
});
