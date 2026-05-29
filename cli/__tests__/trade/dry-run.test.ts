import { describe, expect, it } from "vitest";
import { buildExecuteHint, dryRunResult } from "../../commands/trade/dry-run.js";

describe("dryRunResult", () => {
  it("returns structured dry-run data without printing", () => {
    const r = dryRunResult({
      command: "create-order",
      endpoint: "/v1/user/spot/order",
      body: { pair: "btc_jpy", side: "buy", amount: "0.001" },
      args: { pair: "btc_jpy", side: "buy", amount: "0.001" },
    });
    expect(r.success).toBe(true);
    expect(r.data.dryRun).toBe(true);
    expect(r.data.endpoint).toBe("/v1/user/spot/order");
    expect(r.data.body).toEqual({ pair: "btc_jpy", side: "buy", amount: "0.001" });
    expect(r.data.executeHint).toContain("--execute");
    expect(r.data.executeHint).toContain("--confirm=I-UNDERSTAND-CREATE-ORDER");
    expect(r.data.confirmPhrase).toBe("I-UNDERSTAND-CREATE-ORDER");
  });

  it("masks token and otp_token in the body so the envelope cannot leak them", () => {
    const r = dryRunResult({
      command: "create-order",
      endpoint: "/v1/user/spot/order",
      body: { pair: "btc_jpy", token: "secret-otp", otp_token: "secret-otp2" },
      args: { pair: "btc_jpy" },
    });
    expect(r.data.body.token).toBe("***");
    expect(r.data.body.otp_token).toBe("***");
    expect(JSON.stringify(r.data)).not.toContain("secret-otp");
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

  it("does not duplicate --execute / --confirm if args already contain them", () => {
    const hint = buildExecuteHint({
      command: "create-order",
      endpoint: "/v1/user/spot/order",
      body: { pair: "btc_jpy" },
      args: {
        pair: "btc_jpy",
        execute: true,
        confirm: "anything-that-would-have-been-wrong",
      },
    });
    // The canonical --execute / --confirm=<phrase> appear exactly once, with the correct phrase.
    expect(hint.match(/--execute\b/g)?.length).toBe(1);
    expect(hint.match(/--confirm=/g)?.length).toBe(1);
    expect(hint).toContain("--confirm=I-UNDERSTAND-CREATE-ORDER");
    expect(hint).not.toContain("anything-that-would-have-been-wrong");
  });
});
