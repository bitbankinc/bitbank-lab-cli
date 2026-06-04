// 100行超: profile CRUD（add / list / show / remove / set-default）の各分岐を 1 ファイルにまとめる
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { profileAdd } from "../../commands/profile/add.js";
import { profileList } from "../../commands/profile/list.js";
import { profileRemove } from "../../commands/profile/remove.js";
import { profileSetDefault } from "../../commands/profile/set-default.js";
import { profileShow } from "../../commands/profile/show.js";
import { loadProfiles, type ProfilesFile } from "../../profiles-store.js";
import type { Result } from "../../types.js";

const fakePrompts = (key = "promptedKey", secret = "promptedSecret") => ({
  readVisible: async () => key,
  readHidden: async () => secret,
});

/** Result が success であることを assert し、data を返す。失敗時は内訳を残す */
function unwrap<T>(r: Result<T>): T {
  if (!r.success) throw new Error(`Expected success, got error: ${r.error}`);
  return r.data;
}

describe("profile CRUD", () => {
  let dir: string;
  let path: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "profile-crud-"));
    path = join(dir, "profiles.json");
    saved.BITBANK_PROFILES_PATH = process.env.BITBANK_PROFILES_PATH;
    saved.BITBANK_API_KEY = process.env.BITBANK_API_KEY;
    saved.BITBANK_API_SECRET = process.env.BITBANK_API_SECRET;
    process.env.BITBANK_PROFILES_PATH = path;
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

  it("add: creates profiles.json with mode 0600 and stores entry", async () => {
    const r = await profileAdd({ name: "main" }, fakePrompts("k1", "s1"));
    expect(r.success).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const file = JSON.parse(readFileSync(path, "utf-8")) as ProfilesFile;
    expect(file.profiles.main.key).toBe("k1");
    expect(file.profiles.main.secret).toBe("s1");
  });

  it("add: reads key/secret from env when set (no prompt)", async () => {
    process.env.BITBANK_API_KEY = "envKey";
    process.env.BITBANK_API_SECRET = "envSecret";
    let promptCalled = false;
    const r = await profileAdd(
      { name: "main" },
      {
        readVisible: async () => {
          promptCalled = true;
          return "";
        },
        readHidden: async () => {
          promptCalled = true;
          return "";
        },
      },
    );
    expect(r.success).toBe(true);
    expect(promptCalled).toBe(false);
    expect(unwrap(loadProfiles(path)).profiles.main.key).toBe("envKey");
  });

  it("add: --default sets the new profile as default", async () => {
    const r = await profileAdd({ name: "main", setDefault: true }, fakePrompts());
    expect(unwrap(r).default).toBe(true);
    expect(unwrap(loadProfiles(path)).default).toBe("main");
  });

  it("add: rejects duplicate name", async () => {
    await profileAdd({ name: "main" }, fakePrompts());
    const r2 = await profileAdd({ name: "main" }, fakePrompts());
    expect(r2.success).toBe(false);
  });

  it("add: rejects invalid name", async () => {
    const r = await profileAdd({ name: "../etc/passwd" }, fakePrompts());
    expect(r.success).toBe(false);
  });

  it("list: returns profile names without secret/key", async () => {
    await profileAdd({ name: "main", description: "primary" }, fakePrompts("k1", "s1"));
    await profileAdd({ name: "sub" }, fakePrompts("k2", "s2"));
    const data = unwrap(await profileList());
    const json = JSON.stringify(data);
    expect(json).not.toContain("k1");
    expect(json).not.toContain("s1");
    expect(json).not.toContain("k2");
    expect(json).not.toContain("s2");
    expect(data.map((e) => e.name)).toEqual(["main", "sub"]);
  });

  it("show: masks secret and key", async () => {
    await profileAdd({ name: "main" }, fakePrompts("AKID1234567890", "supersecretvalue"));
    const data = unwrap(await profileShow({ name: "main" }));
    const json = JSON.stringify(data);
    expect(json).not.toContain("supersecretvalue");
    expect(data.secretMasked).toBe("****alue");
    expect(data.keyMasked).toBe("****7890");
  });

  it("show: returns error for unknown profile", async () => {
    const r = await profileShow({ name: "ghost" });
    expect(r.success).toBe(false);
  });

  it("remove: requires --confirm", async () => {
    await profileAdd({ name: "main" }, fakePrompts());
    const r = await profileRemove({ name: "main", confirm: false });
    expect(r.success).toBe(false);
    expect(unwrap(loadProfiles(path)).profiles.main).toBeDefined();
  });

  it("remove: with --confirm removes the profile", async () => {
    await profileAdd({ name: "main" }, fakePrompts());
    const r = await profileRemove({ name: "main", confirm: true });
    expect(r.success).toBe(true);
    expect(unwrap(loadProfiles(path)).profiles.main).toBeUndefined();
  });

  it("remove: clears default when removing the default profile", async () => {
    await profileAdd({ name: "main", setDefault: true }, fakePrompts());
    const r = await profileRemove({ name: "main", confirm: true });
    expect(unwrap(r).defaultCleared).toBe(true);
    expect(unwrap(loadProfiles(path)).default).toBeNull();
  });

  it("remove: keeps profiles.json with empty profiles when last one is removed", async () => {
    await profileAdd({ name: "main", setDefault: true }, fakePrompts());
    await profileRemove({ name: "main", confirm: true });
    const data = unwrap(loadProfiles(path));
    expect(data.profiles).toEqual({});
    expect(data.default).toBeNull();
  });

  it("set-default: updates default to existing profile", async () => {
    await profileAdd({ name: "main" }, fakePrompts("k1", "s1"));
    await profileAdd({ name: "sub" }, fakePrompts("k2", "s2"));
    const r = await profileSetDefault({ name: "sub" });
    expect(r.success).toBe(true);
    expect(unwrap(loadProfiles(path)).default).toBe("sub");
  });

  it("set-default: errors on unknown profile", async () => {
    const r = await profileSetDefault({ name: "ghost" });
    expect(r.success).toBe(false);
  });
});
