// 100行超: credential 解決の各分岐 + handler threading + env 非汚染 を 1 ファイルで網羅
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "../commands/make-handler.js";
import { privateGet } from "../http-private.js";
import { saveProfiles } from "../profiles-store.js";
import { resolveStartupCredentials } from "../startup-credentials.js";
import { captureStdout, mockFetchRaw } from "./test-helpers.js";

const ENV_KEYS = ["BITBANK_PROFILE", "BITBANK_API_KEY", "BITBANK_API_SECRET"] as const;

function isolateEnv(): {
  origCwd: typeof process.cwd;
  saved: Record<string, string | undefined>;
  tmpDir: string;
  profilesPath: string;
  restore: () => void;
} {
  const tmpDir = mkdtempSync(join(tmpdir(), "startup-creds-"));
  const profilesPath = join(tmpDir, "profiles.json");
  const origCwd = process.cwd;
  process.cwd = () => tmpDir;
  const saved: Record<string, string | undefined> = {
    BITBANK_PROFILES_PATH: process.env.BITBANK_PROFILES_PATH,
  };
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.BITBANK_PROFILES_PATH = profilesPath;
  return {
    origCwd,
    saved,
    tmpDir,
    profilesPath,
    restore: () => {
      process.cwd = origCwd;
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe("resolveStartupCredentials", () => {
  let env: ReturnType<typeof isolateEnv>;
  beforeEach(() => {
    env = isolateEnv();
  });
  afterEach(() => env.restore());

  it("returns credentials from --profile flag (profiles.json hit)", () => {
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { sub: { key: "subKey", secret: "subSecret", createdAt: "t" } },
      },
      env.profilesPath,
    );
    const r = resolveStartupCredentials("sub");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ apiKey: "subKey", apiSecret: "subSecret" });
  });

  it("falls back to .env.<name> when --profile not in profiles.json", () => {
    writeFileSync(
      join(env.tmpDir, ".env.bot"),
      "BITBANK_API_KEY=envKey\nBITBANK_API_SECRET=envSecret",
    );
    const r = resolveStartupCredentials("bot");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ apiKey: "envKey", apiSecret: "envSecret" });
  });

  it("uses legacy env vars when no --profile flag is set", () => {
    process.env.BITBANK_API_KEY = "legacyKey";
    process.env.BITBANK_API_SECRET = "legacySecret";
    const r = resolveStartupCredentials(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ apiKey: "legacyKey", apiSecret: "legacySecret" });
  });

  it("--profile flag wins over BITBANK_API_KEY env (priority preserved)", () => {
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { sub: { key: "profileKey", secret: "profileSecret", createdAt: "t" } },
      },
      env.profilesPath,
    );
    process.env.BITBANK_API_KEY = "envKey";
    process.env.BITBANK_API_SECRET = "envSecret";
    const r = resolveStartupCredentials("sub");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.apiKey).toBe("profileKey");
  });

  it("returns success with undefined data when nothing is configured", () => {
    const r = resolveStartupCredentials(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeUndefined();
  });

  it("does not mutate process.env when resolving via profiles.json", () => {
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { sub: { key: "k", secret: "s", createdAt: "t" } },
      },
      env.profilesPath,
    );
    const before = { ...process.env };
    resolveStartupCredentials("sub");
    expect(process.env.BITBANK_API_KEY).toBeUndefined();
    expect(process.env.BITBANK_API_SECRET).toBeUndefined();
    expect(process.env.BITBANK_PROFILE).toBeUndefined();
    expect(process.env).toEqual(before);
  });

  it("does not mutate process.env when resolving via .env.<name>", () => {
    writeFileSync(join(env.tmpDir, ".env.bot"), "BITBANK_API_KEY=k\nBITBANK_API_SECRET=s");
    const before = { ...process.env };
    resolveStartupCredentials("bot");
    expect(process.env.BITBANK_API_KEY).toBeUndefined();
    expect(process.env.BITBANK_API_SECRET).toBeUndefined();
    expect(process.env).toEqual(before);
  });
});

describe("credential threading: ctx → handler → command → privateGet", () => {
  let env: ReturnType<typeof isolateEnv>;
  beforeEach(() => {
    env = isolateEnv();
  });
  afterEach(() => env.restore());

  it("resolved profile credentials reach the HTTP helper", async () => {
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { sub: { key: "threadedKey", secret: "threadedSecret", createdAt: "t" } },
      },
      env.profilesPath,
    );
    const credsResult = resolveStartupCredentials("sub");
    expect(credsResult.success).toBe(true);
    const credentials = credsResult.success ? credsResult.data : undefined;

    let captured: Record<string, string> = {};
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      if (init?.headers) captured = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ success: 1, data: { assets: [] } }));
    };
    const cap = captureStdout();
    const h = handler(
      new URL("../commands/private/assets.js", import.meta.url).pathname,
      "assets",
      () => ({ showAll: false }),
    );
    const mod = await import("../commands/private/assets.js");
    vi.spyOn(mod, "assets").mockImplementation(async (_a, opts) => {
      return privateGet("/user/assets", undefined, {
        ...opts,
        fetch,
        retries: 0,
        nonce: "1",
      });
    });

    await h([], {}, "json", { credentials });
    cap.restore();
    vi.restoreAllMocks();
    expect(captured["ACCESS-KEY"]).toBe("threadedKey");
  });

  it("env-resolved credentials reach the HTTP helper without env mutation downstream", async () => {
    process.env.BITBANK_API_KEY = "envFlowKey";
    process.env.BITBANK_API_SECRET = "envFlowSecret";
    const credsResult = resolveStartupCredentials(undefined);
    const credentials = credsResult.success ? credsResult.data : undefined;
    expect(credentials?.apiKey).toBe("envFlowKey");

    let captured: Record<string, string> = {};
    const fetch = mockFetchRaw({ success: 1, data: { assets: [] } });
    const wrapped: typeof globalThis.fetch = async (input, init) => {
      if (init?.headers) captured = init.headers as Record<string, string>;
      return fetch(input, init);
    };

    const before = { ...process.env };
    const r = await privateGet("/user/assets", undefined, {
      credentials,
      fetch: wrapped,
      retries: 0,
      nonce: "1",
    });
    expect(r.success).toBe(true);
    expect(captured["ACCESS-KEY"]).toBe("envFlowKey");
    expect(process.env).toEqual(before);
  });

  it("HTTP helper does not mutate process.env after a call", async () => {
    const before = { ...process.env };
    const fetch = mockFetchRaw({ success: 1, data: {} });
    await privateGet("/user/assets", undefined, {
      credentials: { apiKey: "k", apiSecret: "s" },
      fetch,
      retries: 0,
      nonce: "1",
    });
    expect(process.env).toEqual(before);
  });

  it("ctx.credentials=undefined → privateGet が NOT_CONFIGURED で失敗する", async () => {
    // env / profiles.json いずれにも creds が無い状態 (isolateEnv で保証済み)。
    // resolveStartupCredentials は data: undefined を返し、make-handler の
    // ctxOpts() が opts を渡さない経路。privateGet は resolveCredentials() に
    // フォールバックして NOT_CONFIGURED エラーを返す。
    const credsResult = resolveStartupCredentials(undefined);
    expect(credsResult.success).toBe(true);
    if (credsResult.success) expect(credsResult.data).toBeUndefined();

    const fetchSpy = vi.fn();
    const cap = captureStdout();
    const h = handler(
      new URL("../commands/private/assets.js", import.meta.url).pathname,
      "assets",
      () => ({ showAll: false }),
    );
    const mod = await import("../commands/private/assets.js");
    let observedOpts: unknown;
    vi.spyOn(mod, "assets").mockImplementation(async (_a, opts) => {
      observedOpts = opts;
      return privateGet("/user/assets", undefined, {
        ...opts,
        fetch: fetchSpy as unknown as typeof globalThis.fetch,
        retries: 0,
      });
    });

    await h([], { machine: true }, "json", { credentials: undefined });
    const out = cap.read();
    cap.restore();
    vi.restoreAllMocks();

    expect(observedOpts).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("BITBANK_API_KEY");
    expect(parsed.error).toContain("BITBANK_API_SECRET");
  });
});
