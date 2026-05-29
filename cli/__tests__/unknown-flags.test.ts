import { describe, expect, it } from "vitest";
import { unknownLongFlags } from "../unknown-flags.js";

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

  it("preserves the inline rawName for typos with =value (--machien=foo)", () => {
    expect(unknownLongFlags([opt("machien")], known)).toEqual(["--machien"]);
  });
});
