import { describe, expect, it, vi } from "vitest";
import { type DryRunInfo, buildExecuteHint, printDryRun } from "../../commands/trade/dry-run.js";

describe("printDryRun", () => {
  it("prints dry run info with endpoint and body", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const info: DryRunInfo = {
      endpoint: "/v1/user/spot/order",
      body: { pair: "btc_jpy", side: "buy", amount: "0.001" },
      executeHint:
        "npx bitbank trade create-order --pair=btc_jpy --execute --confirm=I-UNDERSTAND-CREATE-ORDER",
      confirmPhrase: "I-UNDERSTAND-CREATE-ORDER",
    };
    printDryRun(info);
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("POST /v1/user/spot/order");
    expect(output).toContain('pair: "btc_jpy"');
    expect(output).toContain('side: "buy"');
    expect(output).toContain('amount: "0.001"');
    expect(output).toContain("--execute");
    expect(output).toContain("--confirm=I-UNDERSTAND-CREATE-ORDER");
    writeSpy.mockRestore();
  });

  it("masks token and otp_token in body", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printDryRun({
      endpoint: "/v1/user/spot/order",
      body: { pair: "btc_jpy", token: "secret-otp", otp_token: "secret-otp2" },
      executeHint: "npx bitbank trade create-order --execute",
      confirmPhrase: "I-UNDERSTAND-CREATE-ORDER",
    });
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain('token: "***"');
    expect(output).toContain('otp_token: "***"');
    expect(output).not.toContain("secret-otp");
    expect(output).not.toContain("secret-otp2");
    writeSpy.mockRestore();
  });

  it("prints without confirm phrase if omitted (back-compat for unit tests)", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printDryRun({ endpoint: "/test", body: {}, executeHint: "run --execute" });
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("POST /test");
    expect(output).toContain("run --execute");
    expect(output).not.toContain("--confirm=");
    writeSpy.mockRestore();
  });
});

describe("buildExecuteHint", () => {
  it("appends --execute and --confirm=<phrase> for the command", () => {
    const hint = buildExecuteHint({
      command: "cancel-order",
      endpoint: "/v1/user/spot/cancel_order",
      body: { pair: "btc_jpy", order_id: 123 },
      args: { pair: "btc_jpy", orderId: "123" },
    });
    expect(hint).toContain("npx bitbank trade cancel-order");
    expect(hint).toContain("--pair=btc_jpy");
    expect(hint).toContain("--order-id=123");
    expect(hint).toContain("--execute");
    expect(hint).toContain("--confirm=I-UNDERSTAND-CANCEL-ORDER");
  });

  it("uses the right phrase for each command", () => {
    const cmds = [
      ["create-order", "I-UNDERSTAND-CREATE-ORDER"],
      ["cancel-order", "I-UNDERSTAND-CANCEL-ORDER"],
      ["cancel-orders", "I-UNDERSTAND-CANCEL-ORDERS"],
      ["confirm-deposits", "I-UNDERSTAND-CONFIRM-DEPOSITS"],
      ["confirm-deposits-all", "I-UNDERSTAND-CONFIRM-DEPOSITS-ALL"],
    ] as const;
    for (const [cmd, phrase] of cmds) {
      const hint = buildExecuteHint({
        command: cmd,
        endpoint: "/x",
        body: {},
        args: {},
      });
      expect(hint).toContain(`--confirm=${phrase}`);
    }
  });
});
