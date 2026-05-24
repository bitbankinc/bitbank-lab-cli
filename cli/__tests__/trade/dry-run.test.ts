import { describe, expect, it, vi } from "vitest";
import { type DryRunInfo, printDryRun } from "../../commands/trade/dry-run.js";

describe("printDryRun", () => {
  it("prints dry run info with endpoint and body", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const info: DryRunInfo = {
      endpoint: "/v1/user/spot/order",
      body: { pair: "btc_jpy", side: "buy", amount: "0.001" },
      executeHint: "npx tsx cli/index.ts create-order --pair=btc_jpy --execute",
    };
    printDryRun(info);
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("POST /v1/user/spot/order");
    expect(output).toContain('pair: "btc_jpy"');
    expect(output).toContain('side: "buy"');
    expect(output).toContain('amount: "0.001"');
    expect(output).toContain("--execute");
    writeSpy.mockRestore();
  });

  it("masks token and otp_token in body", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printDryRun({
      endpoint: "/v1/user/spot/order",
      body: { pair: "btc_jpy", token: "secret-otp", otp_token: "secret-otp2" },
      executeHint: "npx bitbank trade create-order --execute",
    });
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain('token: "***"');
    expect(output).toContain('otp_token: "***"');
    expect(output).not.toContain("secret-otp");
    expect(output).not.toContain("secret-otp2");
    writeSpy.mockRestore();
  });

  it("prints empty body correctly", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printDryRun({ endpoint: "/test", body: {}, executeHint: "run --execute" });
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("POST /test");
    expect(output).toContain("run --execute");
    writeSpy.mockRestore();
  });
});
