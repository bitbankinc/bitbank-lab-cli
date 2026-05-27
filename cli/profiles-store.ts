// 100行超: profiles.json の schema + IO + atomic write + 0600 permission warning を集約。
// paper-state.ts と同じく CLI 全体は state を持たないが、profile は API キー切替の
// ローカル設定として例外的に永続化する（CLAUDE.md 参照）。
import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { sanitizeErrorMessage } from "./error-sanitize.js";
import { EXIT } from "./exit-codes.js";
import type { Result } from "./types.js";

export const ProfileEntrySchema = z.object({
  key: z.string().min(1),
  secret: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string(),
});

export const ProfilesFileSchema = z.object({
  version: z.literal(1),
  default: z.string().nullable(),
  profiles: z.record(z.string(), ProfileEntrySchema),
});

export type ProfileEntry = z.infer<typeof ProfileEntrySchema>;
export type ProfilesFile = z.infer<typeof ProfilesFileSchema>;

export function defaultProfilesPath(): string {
  if (process.env.BITBANK_PROFILES_PATH) return process.env.BITBANK_PROFILES_PATH;
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "bitbank", "profiles.json");
  return join(homedir(), ".bitbank", "profiles.json");
}

export function emptyProfilesFile(): ProfilesFile {
  return { version: 1, default: null, profiles: {} };
}

function warnIfInsecure(path: string): void {
  if (process.platform === "win32") return;
  try {
    const { mode } = statSync(path);
    if (mode & 0o077) {
      const octal = `0${(mode & 0o777).toString(8)}`;
      process.stderr.write(
        `Warning: ${path} is readable by other users (mode: ${octal}). Run: chmod 600 ${path}\n`,
      );
    }
  } catch {
    // stat failure is non-fatal; just skip the warning
  }
}

export function loadProfiles(path = defaultProfilesPath()): Result<ProfilesFile> {
  let buf: string;
  try {
    buf = readFileSync(path, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { success: true, data: emptyProfilesFile() };
    }
    return {
      success: false,
      error: `Failed to read profiles: ${sanitizeErrorMessage(e)}`,
      exitCode: EXIT.GENERAL,
    };
  }
  warnIfInsecure(path);
  let json: unknown;
  try {
    json = JSON.parse(buf);
  } catch (e) {
    return {
      success: false,
      error: `Invalid profiles JSON: ${sanitizeErrorMessage(e)}`,
      exitCode: EXIT.GENERAL,
    };
  }
  const parsed = ProfilesFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: sanitizeErrorMessage(`Invalid profiles file at ${path}: schema mismatch`),
      exitCode: EXIT.GENERAL,
    };
  }
  return { success: true, data: parsed.data };
}

export function saveProfiles(
  file: ProfilesFile,
  path = defaultProfilesPath(),
): Result<{ saved: true }> {
  const validated = ProfilesFileSchema.safeParse(file);
  if (!validated.success) {
    return {
      success: false,
      error: "Refusing to save invalid profiles file",
      exitCode: EXIT.GENERAL,
    };
  }
  const data = `${JSON.stringify(validated.data, null, 2)}\n`;
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const fd = openSync(tmp, "w", 0o600);
    try {
      writeSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
    return { success: true, data: { saved: true } };
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      // tmp may not exist; ignore cleanup failure
    }
    return {
      success: false,
      error: `Failed to write profiles: ${sanitizeErrorMessage(e)}`,
      exitCode: EXIT.GENERAL,
    };
  }
}
