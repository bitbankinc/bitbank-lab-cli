import { describe, expect, it } from "vitest";
import { misplacedFlagHints, unknownLongFlags } from "../unknown-flags.js";

// merged を模した「既知 flag 集合」。値は実際は option config だが in 判定のみ使う。
const known = { machine: {}, format: {}, "log-file": {} };
const opt = (name: string, rawName = `--${name}`) => ({ kind: "option" as const, name, rawName });

describe("unknownLongFlags", () => {
  it("flags a nonexistent long flag (--json)", () => {
    expect(unknownLongFlags([opt("json")], known)).toEqual(["--json"]);
  });

  it("flags a typo'd long flag (--machien)", () => {
    expect(unknownLongFlags([opt("machien")], known)).toEqual(["--machien"]);
  });

  it("accepts known long flags (incl. hyphenated)", () => {
    const tokens = [opt("machine"), opt("format"), opt("log-file")];
    expect(unknownLongFlags(tokens, known)).toEqual([]);
  });

  it("ignores short flags (rawName not starting with --)", () => {
    expect(unknownLongFlags([{ kind: "option", name: "m", rawName: "-m" }], known)).toEqual([]);
  });

  it("ignores positional and option-terminator tokens", () => {
    const tokens = [{ kind: "positional" as const }, { kind: "option-terminator" as const }];
    expect(unknownLongFlags(tokens, known)).toEqual([]);
  });

  it("dedupes a repeated unknown flag", () => {
    expect(unknownLongFlags([opt("json"), opt("json")], known)).toEqual(["--json"]);
  });

  it("reports multiple distinct unknown flags in encounter order", () => {
    expect(unknownLongFlags([opt("foo"), opt("machine"), opt("bar")], known)).toEqual([
      "--foo",
      "--bar",
    ]);
  });

  it("flags inherited Object.prototype names (--toString, --constructor) as unknown", () => {
    const tokens = [opt("toString"), opt("constructor"), opt("__proto__")];
    expect(unknownLongFlags(tokens, known)).toEqual(["--toString", "--constructor", "--__proto__"]);
  });

  // parseArgs は `--machien=foo` の rawName を `--machien`（=foo を除いた形）で返すため、
  // ヘルパーも inline value 付き typo を bare な rawName で報告する。
  it("reports the bare rawName for an inline-value typo (--machien=foo → --machien)", () => {
    expect(unknownLongFlags([opt("machien")], known)).toEqual(["--machien"]);
  });
});

describe("misplacedFlagHints", () => {
  it("points paper create-order --position-side to paper create-margin-order (ADR-010)", () => {
    expect(misplacedFlagHints("paper create-order", ["--position-side"])).toEqual([
      "paper create-order は現物専用です。信用の注文は paper create-margin-order を使ってください",
    ]);
  });

  it("gives no hint for other commands or flags (and ignores prototype keys)", () => {
    expect(misplacedFlagHints("paper create-margin-order", ["--position-side"])).toEqual([]);
    expect(misplacedFlagHints("paper create-order", ["--foo"])).toEqual([]);
    expect(misplacedFlagHints("toString", ["--constructor"])).toEqual([]);
  });
});
