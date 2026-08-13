import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Research KEEP / validation PASS must not auto-start paper sessions.
 * Static guarantees + service surface checks.
 */
describe("Phase 4A no auto-start / no paper promote", () => {
  it("research orchestrator does not call paper-forward session create", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/research-engine/orchestrator.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/createPaperForwardSession|paper-forward\/sessions/);
    expect(src).not.toMatch(/paper-trading\/start/);
  });

  it("validation API does not create paper sessions or promote", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/pages/api/backtest/validate.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/createPaperForwardSession|promoteStrategyToBitiq/);
  });

  it("paper session service has no promote path", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/paper-forward/session-service.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/promote|approved|deployed_to_bitiq/);
    expect(src).not.toMatch(/marketOrder|BinanceTradingClient/);
  });
});
