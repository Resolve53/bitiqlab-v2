import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { enrichCandidate } from "../enrich";
import {
  TOKEN,
  NOW_MS,
  fixtureProviders,
  okLiq,
  unavailableLiq,
  seedCandidate,
} from "./helpers";

describe("D. Market type awareness", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("spot: OI/funding/liquidations are not mandatory for READY_FOR_AI_REVIEW", async () => {
    const { deps, candidate, frozen } = await seedCandidate();
    expect(frozen.snapshot.market_type).toBe("spot");
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ liquidations: unavailableLiq() }),
    });
    expect(result.snapshot.market_type).toBe("spot");
    expect(result.snapshot.freshness.oi_ok).toBe(true);
    expect(result.snapshot.freshness.funding_ok).toBe(true);
    expect(result.snapshot.freshness.liquidations_ok).toBe(true);
    expect(result.status).toBe("READY_FOR_AI_REVIEW");
  });

  it("futures: OI/funding/liquidations are critical", async () => {
    const { deps, candidate, frozen } = await seedCandidate({ futures: true });
    expect(frozen.snapshot.market_type).toBe("futures");
    const blocked = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ liquidations: unavailableLiq() }),
    });
    expect(blocked.snapshot.market_type).toBe("futures");
    expect(blocked.status).toBe("ENRICHMENT_PARTIAL");

    const ready = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ liquidations: okLiq() }),
    });
    expect(ready.status).toBe("READY_FOR_AI_REVIEW");
    expect(ready.snapshot.derivatives.liquidations.availability).toBe("OK");
  });

  it("market type is taken from frozen strategy version, not guessed from symbol", async () => {
    const spot = await seedCandidate();
    const spotResult = await enrichCandidate(spot.deps, spot.candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders(),
    });
    expect(spot.candidate.symbol).toBe("BTCUSDT");
    expect(spotResult.snapshot.market_type).toBe("spot");

    const fut = await seedCandidate({ futures: true });
    const futResult = await enrichCandidate(fut.deps, fut.candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ liquidations: okLiq() }),
    });
    expect(fut.candidate.symbol).toBe("BTCUSDT");
    expect(futResult.snapshot.market_type).toBe("futures");
  });
});
