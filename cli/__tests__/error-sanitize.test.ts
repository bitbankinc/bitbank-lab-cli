// 100行超: sanitizer 本体の網羅テスト＋4 適用箇所の回帰テストを 1 ファイルに集約。
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sanitizeErrorMessage } from "../error-sanitize.js";
import { fetchWithRetry } from "../http-core.js";
import { emptyMarginState } from "../paper-margin/state.js";
import { loadState, saveState } from "../paper-state.js";
import { loadProfiles, saveProfiles } from "../profiles-store.js";

describe("sanitizeErrorMessage: path shortening", () => {
  it("shortens /home/<user>/... to basename", () => {
    const r = sanitizeErrorMessage("Failed to read /home/alice/.bitbank/profiles.json");
    expect(r).toBe("Failed to read profiles.json");
    expect(r).not.toContain("/home/alice");
  });

  it("shortens /Users/<name>/... paths", () => {
    const r = sanitizeErrorMessage("ENOENT: no such file '/Users/john/work/data.json'");
    expect(r).not.toContain("/Users/john");
    expect(r).toContain("data.json");
  });

  it("shortens Windows absolute path (backslash)", () => {
    const r = sanitizeErrorMessage("Failed at C:\\Users\\john\\file.json");
    expect(r).not.toContain("C:\\Users");
    expect(r).not.toContain("john");
    expect(r).toContain("file.json");
  });

  it("shortens Windows absolute path (forward slash)", () => {
    const r = sanitizeErrorMessage("Failed at D:/Projects/secret/file.json");
    expect(r).not.toContain("D:/Projects");
    expect(r).toContain("file.json");
  });

  it("preserves URL paths", () => {
    const url = "https://api.bitbank.cc/v1/btc_jpy/ticker";
    const r = sanitizeErrorMessage(`GET ${url} failed`);
    expect(r).toContain(url);
  });

  it("shortens multiple paths in one message", () => {
    const r = sanitizeErrorMessage("copy /home/a/x.txt to /tmp/foo/y.txt failed");
    expect(r).toContain("x.txt");
    expect(r).toContain("y.txt");
    expect(r).not.toContain("/home/a");
    expect(r).not.toContain("/tmp/foo");
  });

  it("does not touch relative paths", () => {
    const r = sanitizeErrorMessage("at ./src/foo.ts:42:10");
    expect(r).toContain("./src/foo.ts:42:10");
  });
});

// 回帰: 連続スラッシュ（パス結合ミスで `~/` 展開の後ろに絶対パスが続いた形）。
// 1 つ目のパスだけ basename 化され、2 つ目が丸ごと残る穴があった。
describe("sanitizeErrorMessage: consecutive slashes", () => {
  it("shortens every path fragment when slashes are doubled", () => {
    expect(sanitizeErrorMessage("Cannot read CSV file: /a/b//c/d/e.csv")).toBe(
      "Cannot read CSV file: e.csv",
    );
  });

  it("does not leak the home directory name from a doubled absolute path", () => {
    const r = sanitizeErrorMessage(
      "Cannot read CSV file: /Users/alice//Users/alice/annual_trade_report.csv",
    );
    expect(r).toBe("Cannot read CSV file: annual_trade_report.csv");
    expect(r).not.toContain("alice");
  });

  it("handles 3+ consecutive slashes, leading or internal", () => {
    expect(sanitizeErrorMessage("read /a/b///c/d.csv")).toBe("read d.csv");
    expect(sanitizeErrorMessage("read ///a/b/c.csv")).toBe("read c.csv");
    expect(sanitizeErrorMessage("read //home/bob/x.csv")).toBe("read x.csv");
  });

  it("shortens each of several doubled-slash paths in one message", () => {
    const r = sanitizeErrorMessage("copy /home/a//tmp/x.txt to /tmp/foo//bar/y.txt failed");
    expect(r).toBe("copy x.txt to y.txt failed");
  });

  it("keeps excluding URLs, relative paths and tilde paths when slashes are doubled", () => {
    const url = "https://api.bitbank.cc//v1/btc_jpy/ticker";
    expect(sanitizeErrorMessage(`GET ${url} failed`)).toContain(url);
    expect(sanitizeErrorMessage("at ./src//foo.ts:42:10")).toContain("./src//foo.ts:42:10");
    expect(sanitizeErrorMessage("at ../src//foo.ts")).toContain("../src//foo.ts");
    expect(sanitizeErrorMessage("read ~/work//data.json")).toContain("~/work//data.json");
  });

  it("shortens Windows paths with doubled separators", () => {
    const r = sanitizeErrorMessage("Failed at C:\\Users\\john\\\\Users\\john\\file.json");
    expect(r).toBe("Failed at file.json");
    expect(r).not.toContain("john");
  });

  it("shortens Windows paths with a doubled separator after the drive letter", () => {
    const r = sanitizeErrorMessage("Failed at D://Projects//secret/file.json");
    expect(r).toBe("Failed at file.json");
    expect(r).not.toContain("Projects");
  });
});

describe("sanitizeErrorMessage: control characters", () => {
  it("escapes null byte to \\u0000", () => {
    expect(sanitizeErrorMessage("Error\x00 here")).toBe("Error\\u0000 here");
  });

  it("escapes ANSI escape and other low control chars", () => {
    const r = sanitizeErrorMessage("\x1b[31mred\x1b[0m");
    // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字漏れの検出が目的
    expect(r).not.toMatch(/[\x00-\x1f\x7f]/);
  });

  it("escapes DEL (0x7f)", () => {
    expect(sanitizeErrorMessage("hi\x7f")).toContain("\\u007f");
  });

  it("escapes newline and carriage return (CRLF injection guard)", () => {
    const r = sanitizeErrorMessage("line1\r\nline2");
    expect(r).not.toMatch(/[\r\n]/);
    expect(r).toContain("\\u000a");
    expect(r).toContain("\\u000d");
  });
});

describe("sanitizeErrorMessage: truncation", () => {
  it("truncates when input exceeds 500 chars", () => {
    const r = sanitizeErrorMessage("x".repeat(700));
    expect(r.length).toBeLessThanOrEqual(500);
    expect(r).toContain("[truncated]");
  });

  it("does not touch shorter input", () => {
    expect(sanitizeErrorMessage("short error")).toBe("short error");
  });

  it("does not truncate exactly at 500 chars", () => {
    const r = sanitizeErrorMessage("x".repeat(500));
    expect(r).toBe("x".repeat(500));
    expect(r).not.toContain("[truncated]");
  });
});

describe("sanitizeErrorMessage: secret masking", () => {
  it("masks 32-char hex token", () => {
    const hex = "0123456789abcdef0123456789abcdef";
    const r = sanitizeErrorMessage(`signature ${hex} mismatch`);
    expect(r).toContain("<redacted>");
    expect(r).not.toContain(hex);
  });

  it("masks 64-char hex token (sha256-style)", () => {
    const hex = "a".repeat(64);
    const r = sanitizeErrorMessage(`hash=${hex}`);
    expect(r).not.toContain(hex);
  });

  it("does not mask short hex sequences", () => {
    expect(sanitizeErrorMessage("status 0x1234 OK")).toContain("0x1234");
    expect(sanitizeErrorMessage("code abcdef12")).toContain("abcdef12");
  });

  it("masks apiKey=value", () => {
    const r = sanitizeErrorMessage("call with apiKey=SECRET-123 failed");
    expect(r).toMatch(/apiKey=<redacted>/i);
    expect(r).not.toContain("SECRET-123");
  });

  it("masks secret=value", () => {
    const r = sanitizeErrorMessage("auth secret=topsecret expired");
    expect(r).toMatch(/secret=<redacted>/i);
    expect(r).not.toContain("topsecret");
  });

  it("masks api_key= and api-key= variants", () => {
    expect(sanitizeErrorMessage("api_key=abc123")).toMatch(/api_key=<redacted>/i);
    expect(sanitizeErrorMessage("api-key=abc123")).toMatch(/api-key=<redacted>/i);
  });

  it("masks token=value and password=value", () => {
    expect(sanitizeErrorMessage("token=xyz")).toMatch(/token=<redacted>/i);
    expect(sanitizeErrorMessage("password=hunter2")).toMatch(/password=<redacted>/i);
  });
});

describe("sanitizeErrorMessage: input types", () => {
  it("extracts Error.message", () => {
    expect(sanitizeErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("passes through strings unchanged when no sensitive content", () => {
    expect(sanitizeErrorMessage("just a string")).toBe("just a string");
  });

  it("stringifies objects", () => {
    expect(sanitizeErrorMessage({ foo: "bar" })).toContain("foo");
  });

  it("handles null/undefined", () => {
    expect(sanitizeErrorMessage(null)).toBe("null");
    expect(sanitizeErrorMessage(undefined)).toBe("undefined");
  });

  it("preserves bitbank API: / CLI: prefixes verbatim", () => {
    expect(sanitizeErrorMessage("bitbank API: rate limit exceeded")).toBe(
      "bitbank API: rate limit exceeded",
    );
    expect(sanitizeErrorMessage("CLI: invalid argument")).toBe("CLI: invalid argument");
  });
});

describe("sanitizeErrorMessage: preserves bitbank API error codes", () => {
  it("does not strip 5-digit error codes like 20001 or 60001", () => {
    expect(sanitizeErrorMessage("20001: API認証失敗")).toBe("20001: API認証失敗");
    expect(sanitizeErrorMessage("60001: 残高不足")).toBe("60001: 残高不足");
  });
});

describe("regression: http-core network error is sanitized", () => {
  it("strips absolute path from caught fetch error", async () => {
    const failing: typeof globalThis.fetch = async () => {
      throw new Error("ENOENT: file not found '/home/runner/work/secret.pem'");
    };
    const r = await fetchWithRetry(
      "http://test",
      {},
      { fetch: failing, retries: 0 },
      () => "unknown",
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).not.toContain("/home/runner");
      expect(r.error).toContain("secret.pem");
    }
  });
});

describe("regression: paper-state errors are sanitized", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paper-sanitize-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loadState: corrupt JSON error does not leak absolute path", async () => {
    const statePath = join(dir, "paper-state.json");
    writeFileSync(statePath, "{not json");
    const r = await loadState(statePath);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).not.toContain(dir);
  });

  it("saveState: write to unwritable target returns sanitized error", async () => {
    // 通常ファイルを置いた場所に対して mkdir すると ENOTDIR/EEXIST で失敗する
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "x");
    const r = await saveState(
      {
        version: 4,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        initialJpy: 0,
        balances: {},
        history: [],
        lastTickAt: "2026-01-01T00:00:00.000Z",
        openOrders: [],
        margin: emptyMarginState("2026-01-01T00:00:00.000Z"),
      },
      join(blocker, "sub", "x.json"),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("Failed to write paper state");
      expect(r.error).not.toContain(dir);
    }
  });
});

describe("regression: profiles-store errors are sanitized", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "profiles-sanitize-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loadProfiles: schema mismatch error does not leak absolute path", () => {
    const p = join(dir, "profiles.json");
    writeFileSync(p, JSON.stringify({ version: 99 }));
    const r = loadProfiles(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).not.toContain(dir);
      expect(r.error).toContain("schema mismatch");
    }
  });

  it("loadProfiles: invalid JSON error does not leak absolute path", () => {
    const p = join(dir, "profiles.json");
    writeFileSync(p, "{not valid json");
    const r = loadProfiles(p);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).not.toContain(dir);
  });

  it("saveProfiles: write to invalid path returns sanitized error", () => {
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "x");
    const r = saveProfiles(
      { version: 1, default: null, profiles: {} },
      join(blocker, "sub", "x.json"),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("Failed to write profiles");
      expect(r.error).not.toContain(dir);
    }
  });
});

// regression: 読み取り失敗に添えた理由（"(file not found)" 等）はマスクを通しても残る。
// パス正規表現は空白で切れるので、括弧の理由は basename の後ろにそのまま出る。
// 理由が消えると「ファイルが無い」のか「権限で読めない」のかが再び判らなくなる。
describe("regression: read-failure reason survives path masking", () => {
  it("keeps the reason after shortening a POSIX path to basename", () => {
    const r = sanitizeErrorMessage(
      "Cannot read CSV file: /Users/alice/Downloads/report.csv (permission denied)",
    );
    expect(r).toBe("Cannot read CSV file: report.csv (permission denied)");
  });

  it("keeps the reason when the path has doubled slashes", () => {
    const r = sanitizeErrorMessage(
      "Cannot read carryover file: /home/alice//tax//carryover.json (file not found)",
    );
    expect(r).toBe("Cannot read carryover file: carryover.json (file not found)");
  });

  it("keeps the reason after shortening a Windows path", () => {
    const r = sanitizeErrorMessage(
      "Cannot read CSV file: C:\\Users\\john\\report.csv (permission denied)",
    );
    expect(r).toBe("Cannot read CSV file: report.csv (permission denied)");
  });
});
