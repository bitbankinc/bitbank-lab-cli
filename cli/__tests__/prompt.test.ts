// 100行超: hidden / non-TTY / cancel / empty input の複数経路を 1 ファイルで網羅する
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeStdin = EventEmitter & {
  isTTY: boolean;
  setRawMode: (v: boolean) => void;
  resume: () => void;
  pause: () => void;
  rawModeCalls: boolean[];
};

function makeFakeStdin(isTTY: boolean): FakeStdin {
  const ee = new EventEmitter() as FakeStdin;
  ee.setMaxListeners(50);
  ee.isTTY = isTTY;
  ee.rawModeCalls = [];
  ee.setRawMode = (v: boolean) => {
    ee.rawModeCalls.push(v);
  };
  ee.resume = () => {};
  ee.pause = () => {};
  return ee;
}

// pendingBuf がモジュール・ローカルなので毎テスト fresh import する
async function freshPrompt() {
  vi.resetModules();
  return await import("../commands/profile/prompt.js");
}

describe("prompt.ts (cli/commands/profile/prompt.ts)", () => {
  let savedStdin: NodeJS.ReadStream;
  let stderrWrites: string[];
  let stdoutWrites: string[];
  let stderrSpy: { mockRestore: () => void };
  let stdoutSpy: { mockRestore: () => void };
  let exitSpy: { mockRestore: () => void };
  let exitCalls: number[];

  beforeEach(() => {
    savedStdin = process.stdin;
    stderrWrites = [];
    stdoutWrites = [];
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((c: unknown) => {
      stderrWrites.push(String(c));
      return true;
    }) as never);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((c: unknown) => {
      stdoutWrites.push(String(c));
      return true;
    }) as never);
    exitCalls = [];
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      exitCalls.push(code ?? 0);
      throw new Error(`__test_exit_${code}`);
    }) as never);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    Object.defineProperty(process, "stdin", { value: savedStdin, configurable: true });
  });

  function setStdin(s: FakeStdin): void {
    Object.defineProperty(process, "stdin", { value: s, configurable: true });
  }

  it("TTY hidden: enables raw mode, captures input, restores raw mode on finish", async () => {
    const fake = makeFakeStdin(true);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readHidden("secret> ");
    fake.emit("data", Buffer.from("abc"));
    fake.emit("data", Buffer.from("\r"));
    expect(await p).toBe("abc");
    expect(fake.rawModeCalls).toEqual([true, false]);
    expect(stderrWrites.join("")).toContain("secret> ");
  });

  it("TTY hidden: input chars are not echoed to stdout/stderr", async () => {
    const fake = makeFakeStdin(true);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const secret = "hunter2-supersecret-XYZ";
    const p = defaultPrompts.readHidden("> ");
    fake.emit("data", Buffer.from(secret));
    fake.emit("data", Buffer.from("\r"));
    expect(await p).toBe(secret);
    expect(stdoutWrites.join("")).not.toContain(secret);
    expect(stderrWrites.join("")).not.toContain(secret);
  });

  it("TTY hidden: backspace removes the previous char", async () => {
    const fake = makeFakeStdin(true);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readHidden("> ");
    fake.emit("data", Buffer.from("abx"));
    fake.emit("data", Buffer.from([127]));
    fake.emit("data", Buffer.from("c\r"));
    expect(await p).toBe("abc");
  });

  it("TTY hidden: Enter only resolves with empty string", async () => {
    const fake = makeFakeStdin(true);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readHidden("> ");
    fake.emit("data", Buffer.from("\r"));
    expect(await p).toBe("");
    expect(fake.rawModeCalls).toEqual([true, false]);
  });

  it("TTY hidden: Ctrl+D (EOF) flushes the buffered input", async () => {
    const fake = makeFakeStdin(true);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readHidden("> ");
    fake.emit("data", Buffer.from("ab"));
    fake.emit("data", Buffer.from([4]));
    expect(await p).toBe("ab");
    expect(fake.rawModeCalls).toEqual([true, false]);
  });

  it("TTY hidden: Ctrl+C calls process.exit(130) after restoring raw mode", async () => {
    const fake = makeFakeStdin(true);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readHidden("> ");
    p.catch(() => undefined);
    expect(() => fake.emit("data", Buffer.from([3]))).toThrow(/__test_exit_130/);
    expect(exitCalls).toEqual([130]);
    expect(fake.rawModeCalls).toContain(false);
  });

  it("non-TTY hidden: falls back to line read from stdin without raw mode", async () => {
    const fake = makeFakeStdin(false);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readHidden("secret> ");
    fake.emit("data", Buffer.from("piped-secret\n"));
    expect(await p).toBe("piped-secret");
    expect(fake.rawModeCalls).toEqual([]);
    expect(stdoutWrites.join("")).not.toContain("piped-secret");
  });

  it("non-TTY: EOF before newline flushes whatever was buffered", async () => {
    const fake = makeFakeStdin(false);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readHidden("> ");
    fake.emit("data", Buffer.from("partial"));
    fake.emit("end");
    expect(await p).toBe("partial");
  });

  it("readVisible: writes prompt to stderr and returns the line (non-TTY)", async () => {
    const fake = makeFakeStdin(false);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readVisible("name> ");
    fake.emit("data", Buffer.from("main\n"));
    expect(await p).toBe("main");
    expect(stderrWrites.join("")).toContain("name> ");
  });

  it("readVisible: handles \\r\\n line endings", async () => {
    const fake = makeFakeStdin(false);
    setStdin(fake);
    const { defaultPrompts } = await freshPrompt();
    const p = defaultPrompts.readVisible("> ");
    fake.emit("data", Buffer.from("hello\r\n"));
    expect(await p).toBe("hello");
  });
});
