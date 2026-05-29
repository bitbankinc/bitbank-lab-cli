import { describe, expect, it, vi } from "vitest";
import { isDryRunData, printDryRunBox } from "../output-dry-run.js";

describe("isDryRunData", () => {
  it("detects dry-run preview data", () => {
    expect(isDryRunData({ dryRun: true, endpoint: "/x", body: {}, executeHint: "y" })).toBe(true);
  });

  it("rejects anything that is not a dry-run preview", () => {
    expect(isDryRunData({ price: 100 })).toBe(false);
    expect(isDryRunData({ dryRun: false })).toBe(false);
    expect(isDryRunData(null)).toBe(false);
    expect(isDryRunData("dryRun")).toBe(false);
    expect(isDryRunData(undefined)).toBe(false);
  });
});

describe("printDryRunBox", () => {
  it("renders the DRY RUN box with endpoint, body and execute hint", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printDryRunBox({
      dryRun: true,
      endpoint: "/v1/user/spot/order",
      body: { pair: "btc_jpy", side: "buy", amount: "0.001" },
      executeHint: "npx bitbank trade create-order --execute --confirm=I-UNDERSTAND-CREATE-ORDER",
      confirmPhrase: "I-UNDERSTAND-CREATE-ORDER",
    });
    const out = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(out).toContain("🔍 DRY RUN");
    expect(out).toContain("POST /v1/user/spot/order");
    expect(out).toContain('pair: "btc_jpy"');
    expect(out).toContain("--confirm=I-UNDERSTAND-CREATE-ORDER");
    writeSpy.mockRestore();
  });

  it("renders already-masked body values and omits the phrase line when absent", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printDryRunBox({
      dryRun: true,
      endpoint: "/x",
      body: { token: "***" },
      executeHint: "run --execute",
    });
    const out = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(out).toContain('token: "***"');
    expect(out).toContain("実行するには --execute を付けてください");
    expect(out).not.toContain("--confirm=");
    writeSpy.mockRestore();
  });
});
