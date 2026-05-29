import { describe, expect, it, vi } from "vitest";
import { handler, tradeHandler } from "../commands/make-handler.js";
import { captureStdout } from "./test-helpers.js";

describe("handler", () => {
  it("calls module function and outputs result", async () => {
    const cap = captureStdout();
    const h = handler(
      new URL("../commands/public/ticker.js", import.meta.url).pathname,
      "ticker",
      (a) => ({ pair: a[0] }),
    );

    const mod = await import("../commands/public/ticker.js");
    vi.spyOn(mod, "ticker").mockResolvedValue({
      success: true,
      data: {
        timestamp: 0,
        last: 100,
        vol: 1,
        buy: 99,
        sell: 101,
        open: 98,
        high: 102,
        low: 97,
      },
    });

    await h(["btc_jpy"], {}, "json");
    const output = cap.read();
    cap.restore();
    vi.restoreAllMocks();
    expect(output).toContain('"last": 100');
  });
});

describe("handler request context (meta)", () => {
  it("attaches request/timezone/source/fetchedAt/returnedRows for public commands", async () => {
    const cap = captureStdout();
    const h = handler(
      new URL("../commands/public/candles.js", import.meta.url).pathname,
      "candles",
      (a, v) => ({ pair: a[0], type: v.type, limit: 100 }),
    );
    vi.spyOn(await import("../commands/public/candles.js"), "candles").mockResolvedValue({
      success: true,
      data: [
        { open: 1, high: 2, low: 1, close: 2, vol: 10, timestamp: 1000 },
        { open: 2, high: 3, low: 2, close: 3, vol: 20, timestamp: 2000 },
      ],
    });

    await h(["btc_jpy"], { type: "1day" }, "json");
    const { meta } = JSON.parse(cap.read());
    cap.restore();
    vi.restoreAllMocks();

    expect(meta.request).toEqual({ command: "candles", pair: "btc_jpy", type: "1day", limit: 100 });
    expect(meta.timezone).toBe("UTC");
    expect(meta.source).toBe("public");
    expect(meta.returnedRows).toBe(2);
    expect(meta.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("preserves existing meta (gaps) while merging context", async () => {
    const cap = captureStdout();
    const h = handler(
      new URL("../commands/public/candles.js", import.meta.url).pathname,
      "candles",
      (a) => ({ pair: a[0] }),
    );
    vi.spyOn(await import("../commands/public/candles.js"), "candles").mockResolvedValue({
      success: true,
      data: [{ open: 1, high: 2, low: 1, close: 2, vol: 10, timestamp: 1000 }],
      meta: { gaps: [{ from: 1, to: 2, missing: 1 }], lastIsIncomplete: true },
    });

    await h(["btc_jpy"], {}, "json");
    const { meta } = JSON.parse(cap.read());
    cap.restore();
    vi.restoreAllMocks();

    expect(meta.gaps).toEqual([{ from: 1, to: 2, missing: 1 }]);
    expect(meta.lastIsIncomplete).toBe(true);
    expect(meta.source).toBe("public");
    expect(meta.request.command).toBe("candles");
  });

  it("does not attach context for paper commands (D3: market data only)", async () => {
    const cap = captureStdout();
    const h = handler(
      new URL("../commands/paper/assets.js", import.meta.url).pathname,
      "paperAssets",
      () => ({}),
    );
    const row = { asset: "jpy", total: 1000, locked: 0, available: 1000 };
    vi.spyOn(await import("../commands/paper/assets.js"), "paperAssets").mockResolvedValue({
      success: true,
      data: [row],
    });

    await h([], {}, "json");
    const parsed = JSON.parse(cap.read());
    cap.restore();
    vi.restoreAllMocks();

    expect("meta" in parsed).toBe(false);
    expect(parsed.data).toEqual([row]);
  });
});

describe("tradeHandler dry-run", () => {
  const dryData = {
    success: true,
    data: {
      dryRun: true,
      endpoint: "/v1/user/spot/cancel_order",
      body: { pair: "btc_jpy", order_id: 123 },
      executeHint:
        "npx bitbank trade cancel-order --pair=btc_jpy --order-id=123 --execute --confirm=I-UNDERSTAND-CANCEL-ORDER",
      confirmPhrase: "I-UNDERSTAND-CANCEL-ORDER",
    },
  };

  function makeTh() {
    return tradeHandler(
      new URL("../commands/trade/cancel-order.js", import.meta.url).pathname,
      "cancelOrder",
      (v) => ({ pair: v.pair as string, orderId: v["order-id"] as string }),
    );
  }

  it("renders the human DRY RUN box by default (json) without printing JSON", async () => {
    const cap = captureStdout();
    vi.spyOn(await import("../commands/trade/cancel-order.js"), "cancelOrder").mockResolvedValue(
      dryData as never,
    );
    await makeTh()([], { pair: "btc_jpy", "order-id": "123" }, "json");
    const out = cap.read();
    cap.restore();
    vi.restoreAllMocks();
    expect(out).toContain("🔍 DRY RUN");
    expect(out).toContain("POST /v1/user/spot/cancel_order");
    expect(() => JSON.parse(out)).toThrow();
  });

  it("emits a single JSON envelope with --machine (no human text)", async () => {
    const cap = captureStdout();
    vi.spyOn(await import("../commands/trade/cancel-order.js"), "cancelOrder").mockResolvedValue(
      dryData as never,
    );
    await makeTh()([], { pair: "btc_jpy", "order-id": "123", machine: true }, "json");
    const out = cap.read();
    cap.restore();
    vi.restoreAllMocks();
    expect(out).not.toContain("DRY RUN");
    expect(JSON.parse(out)).toEqual(dryData);
  });
});
