import { afterEach, describe, expect, it, vi } from "vitest";
import { publicBriefCommands } from "../../commands/public-brief-handler.js";
import { captureStdout } from "../test-helpers.js";

const DATA = {
  as_of: "2026-08-02T01:30:00.000Z",
  as_of_jst: "2026-08-02 Sun 10:30 JST",
  pairs: [],
  errors: [],
  text: "# bitbank periodical brief 2026-08-02 Sun JST 10:30  (1 pairs)\n## btc_jpy  px=1",
  note: "n",
};

describe("periodical-brief handler", () => {
  afterEach(() => vi.restoreAllMocks());

  async function runWith(
    args: string[],
    values: Record<string, string | boolean | undefined>,
    format: "json" | "table" | "csv",
  ) {
    const mod = await import("../../commands/public/periodical-brief.js");
    const spy = vi.spyOn(mod, "periodicalBrief").mockResolvedValue({ success: true, data: DATA });
    const cap = captureStdout();
    try {
      await publicBriefCommands["periodical-brief"].handler(args, values, format, {
        command: "periodical-brief",
      });
    } finally {
      cap.restore();
    }
    return { spy, out: cap.read() };
  }

  it("passes positional pairs plus --pairs, --top, --all, --concurrency, --no-cache", async () => {
    const { spy } = await runWith(
      ["btc_jpy", "eth_jpy"],
      { pairs: "xrp_jpy, sol_jpy", top: "5", all: true, concurrency: "8", "no-cache": true },
      "json",
    );
    expect(spy).toHaveBeenCalledWith({
      pairs: ["btc_jpy", "eth_jpy", "xrp_jpy", "sol_jpy"],
      top: "5",
      all: true,
      concurrency: "8",
      noCache: true,
    });
  });

  it("--format=table prints the digest text as-is (no table rendering)", async () => {
    const { out } = await runWith([], {}, "table");
    expect(out).toBe(`${DATA.text}\n`);
  });

  it("default json prints the envelope with request context", async () => {
    const { out } = await runWith(["btc_jpy"], {}, "json");
    const env = JSON.parse(out);
    expect(env.success).toBe(true);
    expect(env.data.text).toBe(DATA.text);
    expect(env.meta.source).toBe("public");
    expect(env.meta.request.command).toBe("periodical-brief");
  });

  it("--machine wins over table and emits one compact line", async () => {
    const { out } = await runWith([], { machine: true }, "table");
    expect(out.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(out).data.note).toBe("n");
  });
});
