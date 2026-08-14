import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  getTradingSafetyState,
  assertLiveTradingAllowed,
} from "@/lib/trading-safety";

describe("Phase 4B live-trading safety", () => {
  it("ENABLE_LIVE_TRADING remains false-safe and exchange orders are forbidden", () => {
    expect(getTradingSafetyState().enableLiveTrading).toBe(false);
    expect(getTradingSafetyState().exchangeOrdersAllowed).toBe(false);
    expect(getTradingSafetyState().liveForwardExecutionEnabled).toBe(false);
    expect(getTradingSafetyState().paperSimExecutionEnabled).toBe(true);
    expect(getTradingSafetyState().phase).toBe("4B");
    expect(() => assertLiveTradingAllowed()).toThrow(/Live trading is disabled/);
  });

  it("tick API does not import BinanceTradingClient", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/pages/api/paper-forward/sessions/[id]/tick.ts"
      ),
      "utf8"
    );
    expect(src).not.toMatch(/BinanceTradingClient|marketOrder|binance-trading/);
  });
});
