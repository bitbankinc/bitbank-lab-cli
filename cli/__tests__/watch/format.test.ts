// 100行超: nullableNumStr 移行後の writer 全体（JSONL / table / decimals / null 表示）を網羅
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type PairInfo,
  type TickerData,
  createJsonlWriter,
  createTableWriter,
  createWriter,
  formatJsonl,
} from "../../watch/format.js";

const sample: TickerData = {
  ts: "2026-05-06T10:00:00.000Z",
  pair: "btc_jpy",
  last: 100,
  bid: 99,
  ask: 101,
  high: 110,
  low: 90,
  vol: 1.23,
};

const jpyInfo: PairInfo = { priceDecimals: 0, amountDecimals: 4 };
const xrpBtcInfo: PairInfo = { priceDecimals: 8, amountDecimals: 0 };

describe("watch format", () => {
  let writes: string[] = [];
  let writeSpy: { mockRestore: () => void };

  beforeEach(() => {
    writes = [];
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as never);
  });

  afterEach(() => writeSpy.mockRestore());

  it("formatJsonl produces single-line JSON with numbers", () => {
    expect(formatJsonl(sample)).toBe(JSON.stringify(sample));
    expect(formatJsonl(sample)).toContain('"last":100');
    expect(formatJsonl(sample)).not.toContain('"last":"100"');
  });

  it("createJsonlWriter writes one line per ticker with null preserved", () => {
    const w = createJsonlWriter();
    w({ ...sample, bid: null });
    expect(writes[0]).toContain('"bid":null');
  });

  it("createTableWriter prints first row plain, then redraws with ANSI", () => {
    const w = createTableWriter(jpyInfo);
    w(sample);
    w({ ...sample, last: 105 });
    expect(writes[0]).not.toContain("\x1b[");
    expect(writes[1]).toContain("\x1b[1A");
    expect(writes[1]).toContain("\x1b[2K\r");
    expect(writes[1]).toContain("last=105");
    expect(writes[1]).toContain("@10:00:00");
  });

  it("createTableWriter formats JPY pair with 0 price decimals", () => {
    const w = createTableWriter(jpyInfo);
    w({ ...sample, last: 5123456.789, vol: 1.23456 });
    expect(writes[0]).toContain("last=5123457");
    expect(writes[0]).toContain("vol=1.2346");
  });

  it("createTableWriter formats BTC-quote pair with 8 price decimals", () => {
    const w = createTableWriter(xrpBtcInfo);
    w({ ...sample, pair: "xrp_btc", last: 0.00005432, vol: 100 });
    expect(writes[0]).toContain("last=0.00005432");
    expect(writes[0]).toContain("vol=100");
  });

  it("createTableWriter shows '-' for null fields", () => {
    const w = createTableWriter(jpyInfo);
    w({ ...sample, bid: null, ask: null });
    expect(writes[0]).toContain("bid=-");
    expect(writes[0]).toContain("ask=-");
  });

  it("createTableWriter falls back to String(n) when no pair info", () => {
    const w = createTableWriter();
    w({ ...sample, last: 100.5 });
    expect(writes[0]).toContain("last=100.5");
  });

  it("createWriter picks table or jsonl based on fmt", () => {
    const t = createWriter("table", jpyInfo);
    const j = createWriter("json");
    t(sample);
    j(sample);
    expect(writes[0]).toContain("last=100");
    expect(writes[1]).toBe(`${JSON.stringify(sample)}\n`);
  });

  it("formatJsonl throws on circular payloads", () => {
    const circular: Record<string, unknown> = { ...sample };
    circular.self = circular;
    expect(() => formatJsonl(circular as unknown as TickerData)).toThrow();
  });
});
