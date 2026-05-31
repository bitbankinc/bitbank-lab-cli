// F-1 + F-2 回帰: API 由来文字列の端末制御文字（ANSI/ESC）が table / csv /
// human エラーの 3 経路で無害化されることを固定する。CSV インジェクション防御
// （TAB/CR/LF 温存 + クォート）が回帰していないことも併せて検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../output.js";
import { escapeControlChars, escapeControlCharsForCsv } from "../sanitize-control.js";

const ESC = "\x1b"; // ANSI エスケープ（0x1b）

describe("escapeControlChars (shared helper)", () => {
  it("escapes ESC / NUL / DEL / CR / LF / TAB to \\uXXXX", () => {
    expect(escapeControlChars(`${ESC}[31mred`)).toBe("\\u001b[31mred");
    expect(escapeControlChars("a\x00b")).toBe("a\\u0000b");
    expect(escapeControlChars("a\x7fb")).toBe("a\\u007fb");
    expect(escapeControlChars("a\r\n\tb")).toBe("a\\u000d\\u000a\\u0009b");
  });

  it("leaves normal text untouched", () => {
    expect(escapeControlChars("just text 123")).toBe("just text 123");
  });
});

describe("escapeControlCharsForCsv (shared helper)", () => {
  it("escapes ESC but preserves TAB/CR/LF (CSV quoting handles those)", () => {
    expect(escapeControlCharsForCsv(`${ESC}x`)).toBe("\\u001bx");
    expect(escapeControlCharsForCsv("a\tb\rc\nd")).toBe("a\tb\rc\nd");
  });

  it("escapes other C0 controls (BEL/VT/FF) and DEL", () => {
    expect(escapeControlCharsForCsv("a\x07b")).toBe("a\\u0007b"); // BEL
    expect(escapeControlCharsForCsv("a\x0bb")).toBe("a\\u000bb"); // VT
    expect(escapeControlCharsForCsv("a\x0cb")).toBe("a\\u000cb"); // FF
    expect(escapeControlCharsForCsv("a\x7fb")).toBe("a\\u007fb"); // DEL
  });
});

describe("output sanitization (F-1 / F-2)", () => {
  let stdout: string;
  let stderr: string;

  beforeEach(() => {
    stdout = "";
    stderr = "";
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      stdout += s;
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      stderr += s;
      return true;
    });
    process.exitCode = undefined;
  });
  afterEach(() => vi.restoreAllMocks());

  describe("F-1: printTable", () => {
    it("does not emit raw ESC for an ANSI-laced cell value", () => {
      output({ success: true, data: { label: `${ESC}[31mEVIL${ESC}[0m` } }, "table");
      expect(stdout).not.toContain(ESC);
      expect(stdout).toContain("\\u001b");
    });

    it("escapes an embedded newline so a cell cannot inject extra rows", () => {
      output({ success: true, data: { note: "line1\nline2" } }, "table");
      // header + divider + 1 データ行 = 3 行（セル内の改行は U+000A に無害化）
      expect(stdout.replace(/\n$/, "").split("\n").length).toBe(3);
      expect(stdout).toContain("\\u000a");
    });
  });

  describe("F-1: printCsv", () => {
    it("does not emit raw ESC for an ANSI-laced cell value", () => {
      output({ success: true, data: { originator: `${ESC}[2J危険` } }, "csv");
      expect(stdout).not.toContain(ESC);
      expect(stdout).toContain("\\u001b");
    });

    it("escapes ESC and still quotes when the value also contains a comma", () => {
      output({ success: true, data: { v: `a${ESC},b` } }, "csv");
      expect(stdout).not.toContain(ESC);
      expect(stdout.replace(/\n$/, "").split("\n")[1]).toBe('"a\\u001b,b"');
    });

    it("regression: quotes a leading = formula prefix", () => {
      output({ success: true, data: { v: "=SUM(A1)" } }, "csv");
      expect(stdout.replace(/\n$/, "").split("\n")[1]).toBe('"=SUM(A1)"');
    });

    it("regression: preserves + quotes a leading TAB", () => {
      output({ success: true, data: { v: "\tx" } }, "csv");
      expect(stdout.replace(/\n$/, "").split("\n")[1]).toBe('"\tx"');
    });

    it("regression: preserves + quotes a value containing a newline", () => {
      output({ success: true, data: { v: "line1\nline2" } }, "csv");
      expect(stdout).toContain('"line1\nline2"');
    });

    it("regression: RFC 4180 doubles embedded quotes", () => {
      output({ success: true, data: { v: 'a,"b"' } }, "csv");
      expect(stdout.replace(/\n$/, "").split("\n")[1]).toBe('"a,""b"""');
    });
  });

  describe("F-2: human error path", () => {
    it("strips raw ESC from a human-formatted error", () => {
      output({ success: false, error: `${ESC}[31mfake prompt${ESC}[0m` }, "json");
      expect(stderr).not.toContain(ESC);
      expect(stderr).toContain("\\u001b");
      expect(process.exitCode).toBe(1);
    });

    it("escapes CRLF to prevent stderr/log line injection", () => {
      output({ success: false, error: "real error\r\nFAKE: success" }, "json");
      expect(stderr).not.toMatch(/[\r\n]FAKE/);
      expect(stderr).toContain("\\u000d\\u000a");
    });
  });
});
