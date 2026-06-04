// 100行超: credential 解決の優先度（BITBANK_PROFILE > default profile > legacy env vars）を 1 ファイルで網羅
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCredentials } from "../../profiles-resolver.js";
import { saveProfiles } from "../../profiles-store.js";

describe("resolveCredentials: priority order", () => {
  let dir: string;
  let path: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "profile-resolver-"));
    path = join(dir, "profiles.json");
    saved.BITBANK_PROFILES_PATH = process.env.BITBANK_PROFILES_PATH;
    saved.BITBANK_PROFILE = process.env.BITBANK_PROFILE;
    saved.BITBANK_API_KEY = process.env.BITBANK_API_KEY;
    saved.BITBANK_API_SECRET = process.env.BITBANK_API_SECRET;
    process.env.BITBANK_PROFILES_PATH = path;
    delete process.env.BITBANK_PROFILE;
    delete process.env.BITBANK_API_KEY;
    delete process.env.BITBANK_API_SECRET;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns Err with helpful message when nothing is configured", () => {
    const r = resolveCredentials();
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("bitbank profile add");
      expect(r.error).toContain("BITBANK_API_KEY");
      expect(r.error).toContain("BITBANK_API_SECRET");
    }
  });

  it("uses legacy env vars when no profile is configured", () => {
    process.env.BITBANK_API_KEY = "legacyKey";
    process.env.BITBANK_API_SECRET = "legacySecret";
    const r = resolveCredentials();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.apiKey).toBe("legacyKey");
      expect(r.data.apiSecret).toBe("legacySecret");
    }
  });

  it("uses the default profile from profiles.json over legacy env vars", () => {
    saveProfiles(
      {
        version: 1,
        default: "main",
        profiles: { main: { key: "mainKey", secret: "mainSecret", createdAt: "t" } },
      },
      path,
    );
    process.env.BITBANK_API_KEY = "legacyKey";
    process.env.BITBANK_API_SECRET = "legacySecret";
    const r = resolveCredentials();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.apiKey).toBe("mainKey");
    }
  });

  it("BITBANK_PROFILE env wins over default profile", () => {
    saveProfiles(
      {
        version: 1,
        default: "main",
        profiles: {
          main: { key: "mainKey", secret: "mainSecret", createdAt: "t" },
          sub: { key: "subKey", secret: "subSecret", createdAt: "t" },
        },
      },
      path,
    );
    process.env.BITBANK_PROFILE = "sub";
    const r = resolveCredentials();
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.apiKey).toBe("subKey");
  });

  it("returns Err if BITBANK_PROFILE points to unknown profile", () => {
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { main: { key: "k", secret: "s", createdAt: "t" } },
      },
      path,
    );
    process.env.BITBANK_PROFILE = "ghost";
    process.env.BITBANK_API_KEY = "legacyKey";
    process.env.BITBANK_API_SECRET = "legacySecret";
    const r = resolveCredentials();
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("ghost");
      expect(r.error).toContain("main");
    }
  });

  it("falls back to legacy env vars when default profile is null and no BITBANK_PROFILE", () => {
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { main: { key: "mainKey", secret: "mainSecret", createdAt: "t" } },
      },
      path,
    );
    process.env.BITBANK_API_KEY = "legacyKey";
    process.env.BITBANK_API_SECRET = "legacySecret";
    const r = resolveCredentials();
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.apiKey).toBe("legacyKey");
  });
});
