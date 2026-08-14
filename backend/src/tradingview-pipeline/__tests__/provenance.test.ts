import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  generatePineFromFrozen,
  pineContainsProvenance,
  BITIQ_PINE_VERSION,
  loadFrozenVersionAuthority,
} from "@/tradingview-pipeline";
import { TOKEN, longFrozen, authorityDeps } from "./helpers";

describe("C. Provenance", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("embeds strategy_id, strategy_version_id, and snapshot_hash", async () => {
    const frozen = longFrozen();
    const authority = await loadFrozenVersionAuthority(authorityDeps(frozen.row), {
      strategy_id: frozen.row.strategy_id,
      strategy_version_id: frozen.row.id,
      snapshot_hash: frozen.hash,
      symbol: frozen.snapshot.symbol,
    });
    const pine = generatePineFromFrozen(authority, { webhookToken: TOKEN });
    const markers = pineContainsProvenance(pine, {
      strategyId: frozen.row.strategy_id,
      strategyVersionId: frozen.row.id,
      snapshotHash: frozen.hash,
    });
    expect(markers.strategy_id).toBe(true);
    expect(markers.strategy_version_id).toBe(true);
    expect(markers.snapshot_hash).toBe(true);
    expect(markers.pine_version).toBe(true);
    expect(pine).toContain(`// BITIQ_STRATEGY_ID: ${frozen.row.strategy_id}`);
    expect(pine).toContain(`// BITIQ_STRATEGY_VERSION_ID: ${frozen.row.id}`);
    expect(pine).toContain(`// BITIQ_SNAPSHOT_HASH: ${frozen.hash}`);
    expect(pine).toContain(`PINE_VERSION = "${BITIQ_PINE_VERSION}"`);
    expect(pine).toContain("TRADINGVIEW");
    expect(pine).toContain("build_candidate_json");
    expect(pine).toMatch(/source/);
  });
});
