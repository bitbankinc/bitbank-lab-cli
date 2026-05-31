// 出力契約（output contract）の回帰テスト。
// machine envelope / trade dry-run / --help / table・csv 整形の「形」を固定し、
// 破壊的変更（例: --machine の dry-run が人間向けテキストを出す PR2 不具合）を CI で検知する。
// envelope の shape 検査は machine-output.test.ts、整形の単体は output.test.ts と一部重なるが、
// ここでは「安定契約」として鍵集合・行構造を明示 equality で宣言するのが目的。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHelp } from "../commands/schema/help.js";
import { showHelp, showTradeHelp } from "../help-print.js";
import { machineOutput, output } from "../output.js";

function captureStreams() {
  const streams = { stdout: "", stderr: "" };
  vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    streams.stdout += s;
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((s) => {
    streams.stderr += s;
    return true;
  });
  return streams;
}

function captureLog(fn: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    lines.push(typeof msg === "string" ? msg : String(msg));
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

const DRY_RUN_DATA = {
  dryRun: true as const,
  endpoint: "/v1/user/spot/order",
  body: { pair: "btc_jpy", side: "buy", amount: "0.0001" },
  executeHint: "bitbank trade create-order --execute --confirm=I-UNDERSTAND-CREATE-ORDER",
  confirmPhrase: "I-UNDERSTAND-CREATE-ORDER",
};

describe("output contract", () => {
  let streams: { stdout: string; stderr: string };

  beforeEach(() => {
    streams = captureStreams();
    process.exitCode = undefined;
  });

  // stdout/stderr のスパイを毎テスト後に復元してテスト独立性を保つ（後続ファイルへ漏らさない）。
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // 1. machine 出力契約（安定契約として鍵集合を明示 equality で固定）
  // ─────────────────────────────────────────────────────────
  describe("machine envelope", () => {
    it("success envelope は { success, data } のみ（meta/partial 無しなら鍵を増やさない）", () => {
      machineOutput({ success: true, data: { price: 100 } });
      const parsed = JSON.parse(streams.stdout);
      expect(Object.keys(parsed).sort()).toEqual(["data", "success"]);
      expect(parsed).toEqual({ success: true, data: { price: 100 } });
      expect(streams.stderr).toBe("");
    });

    it("success envelope は meta / partial を持つときだけ鍵を足す", () => {
      machineOutput({
        success: true,
        data: [1],
        partial: true,
        meta: { rateLimit: { remaining: 5, limit: 10, reset: 1 } },
      });
      const parsed = JSON.parse(streams.stdout);
      expect(Object.keys(parsed).sort()).toEqual(["data", "meta", "partial", "success"]);
      expect(parsed.partial).toBe(true);
      expect(parsed.meta.rateLimit).toEqual({ remaining: 5, limit: 10, reset: 1 });
    });

    it("error envelope は { success:false, error, exitCode } 固定で stdout に出す", () => {
      machineOutput({ success: false, error: "not found", exitCode: 4 });
      const parsed = JSON.parse(streams.stdout);
      expect(Object.keys(parsed).sort()).toEqual(["error", "exitCode", "success"]);
      expect(parsed).toEqual({ success: false, error: "not found", exitCode: 4 });
      expect(streams.stderr).toBe("");
      expect(process.exitCode).toBe(4);
    });

    it("error envelope は exitCode 未指定なら 1 を補う", () => {
      machineOutput({ success: false, error: "boom" });
      expect(JSON.parse(streams.stdout).exitCode).toBe(1);
      expect(process.exitCode).toBe(1);
    });

    it("machine 出力は1行の改行終端 JSON（複数行を出さない）", () => {
      machineOutput({ success: true, data: { a: 1 } });
      expect(streams.stdout.endsWith("\n")).toBe(true);
      expect(streams.stdout.trimEnd()).not.toContain("\n");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 2. trade dry-run × --machine（PR2 回帰）: 単一 JSON envelope、人間向け文字列を出さない
  // ─────────────────────────────────────────────────────────
  describe("trade dry-run under --machine", () => {
    it("dryRun データを単一 JSON envelope として stdout に出す", () => {
      output({ success: true, data: DRY_RUN_DATA }, "json", false, true);
      const parsed = JSON.parse(streams.stdout);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(DRY_RUN_DATA);
    });

    it("human 向け DRY RUN ボックスや日本語文字列を出さない", () => {
      output({ success: true, data: DRY_RUN_DATA }, "json", false, true);
      expect(streams.stdout).not.toContain("DRY RUN");
      expect(streams.stdout).not.toContain("実行するには");
      expect(streams.stderr).toBe("");
    });

    it("format が table/csv でも machine では JSON envelope を貫く", () => {
      output({ success: true, data: DRY_RUN_DATA }, "table", false, true);
      expect(() => JSON.parse(streams.stdout)).not.toThrow();
      expect(JSON.parse(streams.stdout).data.dryRun).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 3. trade dry-run（既定 human）: 🔍 DRY RUN ボックスの主要行が崩れない
  // ─────────────────────────────────────────────────────────
  describe("trade dry-run human box", () => {
    it("主要行（ヘッダ・エンドポイント・body・confirm・execute hint）を含む", () => {
      output({ success: true, data: DRY_RUN_DATA }, "json");
      const out = streams.stdout;
      expect(out).toContain("🔍 DRY RUN（実際のAPIは叩きません）");
      expect(out).toContain("POST /v1/user/spot/order");
      expect(out).toContain('pair: "btc_jpy"');
      expect(out).toContain("--confirm=I-UNDERSTAND-CREATE-ORDER");
      expect(out).toContain(DRY_RUN_DATA.executeHint);
      // human ボックスは意図的に JSON ではない（後方互換）
      expect(() => JSON.parse(out)).toThrow();
    });

    it("confirmPhrase が無いときは --confirm 行を出さず --execute のみ案内する", () => {
      output(
        {
          success: true,
          data: { dryRun: true, endpoint: "/x", body: {}, executeHint: "run --execute" },
        },
        "json",
      );
      expect(streams.stdout).toContain("実行するには --execute を付けてください");
      expect(streams.stdout).not.toContain("--confirm=");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 4. --help の主要セクションが存在する
  // ─────────────────────────────────────────────────────────
  describe("help sections", () => {
    it("top-level help は Usage / Commands / Options と代表コマンドを含む", () => {
      const out = captureLog(showHelp);
      expect(out).toContain("Usage: bitbank <command> [options]");
      expect(out).toContain("Commands:");
      expect(out).toContain("Options:");
      expect(out).toContain("ticker");
      expect(out).toContain("trade <subcommand>");
      expect(out).toContain("--machine");
    });

    it("trade help は dry-run 既定と --execute 案内を含む", () => {
      const out = captureLog(showTradeHelp);
      expect(out).toContain("Usage: bitbank trade <subcommand> [options]");
      expect(out).toContain("dry-run");
      expect(out).toContain("--execute");
      expect(out).toContain("create-order");
    });

    it("ticker のコマンド help は Usage / Category / Examples を含む", () => {
      const text = buildHelp("ticker", "Get ticker") ?? "";
      expect(text).toContain("Usage: bitbank ticker");
      expect(text).toContain("Category: public");
      expect(text).toContain("Examples:");
    });

    it("trade コマンドの help は Category: trade と --execute を含む", () => {
      const text = buildHelp("create-order", "Create a spot order") ?? "";
      expect(text).toContain("Usage: bitbank trade create-order");
      expect(text).toContain("Category: trade");
      expect(text).toContain("--execute");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 5. --format=table / csv の整形（ヘッダ行・区切り行・CSV インジェクション）
  // ─────────────────────────────────────────────────────────
  describe("table format", () => {
    it("ヘッダ行・区切り行・データ行の3構造を保つ", () => {
      output({ success: true, data: { sell: 100, buy: 99 } }, "table");
      const lines = streams.stdout.replace(/\n$/, "").split("\n");
      expect(lines[0]).toBe("sell  buy");
      // 区切り行は各列幅に合わせた '-' で、列名と桁が揃う（output-tabular.ts:30）
      expect(lines[1]).toBe("----  ---");
      expect(lines[2]).toBe("100   99 ");
    });

    it("配列データは全行を列幅で揃えて出す", () => {
      output({ success: true, data: [{ a: 1 }, { a: 2222 }] }, "table");
      const lines = streams.stdout.replace(/\n$/, "").split("\n");
      expect(lines[0]).toBe("a   ");
      expect(lines[1]).toBe("----");
      expect(lines[2]).toBe("1   ");
      expect(lines[3]).toBe("2222");
    });
  });

  describe("csv format", () => {
    it("ヘッダ行とデータ行を出す", () => {
      output({ success: true, data: { sell: 100, buy: 99 } }, "csv");
      const lines = streams.stdout.replace(/\n$/, "").split("\n");
      expect(lines[0]).toBe("sell,buy");
      expect(lines[1]).toBe("100,99");
    });

    it("カンマ・二重引用符を RFC 4180 でエスケープする", () => {
      output({ success: true, data: { name: 'a,"b"', value: 1 } }, "csv");
      const lines = streams.stdout.replace(/\n$/, "").split("\n");
      expect(lines[1]).toBe('"a,""b""",1');
    });

    it.each([
      ["=SUM(A1)", '"=SUM(A1)"'],
      ["+1", '"+1"'],
      ["-2", '"-2"'],
      ["@cmd", '"@cmd"'],
      ["\ttab", '"\ttab"'],
      ["\rcr", '"\rcr"'],
    ])(
      "CSV インジェクション接頭辞 %j を強制クォートする (output-tabular.ts:38)",
      (input, quoted) => {
        output({ success: true, data: { name: input, value: 1 } }, "csv");
        const firstField = streams.stdout.replace(/\n$/, "").split("\n")[1].split(",")[0];
        expect(firstField).toBe(quoted);
      },
    );

    it("安全な接頭辞の値はクォートしない", () => {
      output({ success: true, data: { name: "hello", value: 1 } }, "csv");
      expect(streams.stdout.replace(/\n$/, "").split("\n")[1]).toBe("hello,1");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 6. exit code × stream（PR1/PR3 の確定挙動を回帰として固定）
  // ─────────────────────────────────────────────────────────
  describe("exit code x stream", () => {
    it("human エラーは stderr に出し exitCode を伝播、stdout は空", () => {
      output({ success: false, error: "param invalid", exitCode: 4 }, "json");
      expect(streams.stderr).toContain("Error: param invalid");
      expect(streams.stdout).toBe("");
      expect(process.exitCode).toBe(4);
    });

    it("machine エラーは stdout の JSON に出し stderr は空（同じ exitCode）", () => {
      output({ success: false, error: "param invalid", exitCode: 4 }, "json", false, true);
      const parsed = JSON.parse(streams.stdout);
      expect(parsed).toEqual({ success: false, error: "param invalid", exitCode: 4 });
      expect(streams.stderr).toBe("");
      expect(process.exitCode).toBe(4);
    });

    it("human 成功は stdout のみ、stderr を汚さない", () => {
      output({ success: true, data: { ok: 1 } }, "json");
      expect(JSON.parse(streams.stdout)).toEqual({ success: true, data: { ok: 1 } });
      expect(streams.stderr).toBe("");
    });
  });
});
