import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperInit } from "../../commands/paper/init.js";
import { EXIT } from "../../exit-codes.js";

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-init-"));
  statePath = join(dir, "paper-state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("paper init", () => {
  it("creates a state file with initial JPY", async () => {
    const r = await paperInit({ jpy: "1000000", statePath });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.initialJpy).toBe(1000000);
    expect(r.data.balances.jpy).toBe(1000000);
    expect(r.data.history).toEqual([]);
    const raw = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(raw.version).toBe(4);
    expect(raw.balances.jpy).toBe(1000000);
    expect(raw.openOrders).toEqual([]);
    // 信用（ADR-010）は空で、公表ルール由来の値を init 時点で固定する
    expect(raw.margin).toMatchObject({ positions: [], orders: [], call: null, history: [] });
    expect(raw.margin.assumptions.rules).toEqual({
      losscutMultiplier: 0.5,
      marginCallHourJst: 15,
      marginCallGraceMs: 86_400_000,
    });
    expect(raw.margin.assumptions.fixedAt).toBe(raw.createdAt);
    expect(typeof raw.lastTickAt).toBe("string");
  });

  it("rejects non-positive jpy", async () => {
    const r = await paperInit({ jpy: "0", statePath });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects negative jpy", async () => {
    const r = await paperInit({ jpy: "-1", statePath });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("refuses to overwrite existing state without --force", async () => {
    await paperInit({ jpy: "1000000", statePath });
    const r2 = await paperInit({ jpy: "500000", statePath });
    expect(r2.success).toBe(false);
    if (!r2.success) expect(r2.error).toContain("already exists");
  });

  it("overwrites with --force", async () => {
    await paperInit({ jpy: "1000000", statePath });
    const r2 = await paperInit({ jpy: "500000", force: true, statePath });
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.initialJpy).toBe(500000);
  });
});
