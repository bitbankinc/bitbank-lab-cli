import { EXIT } from "../../exit-codes.js";
import { updateProfiles } from "../../profiles-mutate.js";
import type { ProfilesFile } from "../../profiles-store.js";
import type { Result } from "../../types.js";

export type ProfileRemoveArgs = {
  name: string;
  confirm: boolean;
};

export type ProfileRemoveResult = {
  removed: string;
  defaultCleared: boolean;
};

export async function profileRemove(args: ProfileRemoveArgs): Promise<Result<ProfileRemoveResult>> {
  if (!args.confirm) {
    return {
      success: false,
      error: "Refusing to remove profile without --confirm",
      exitCode: EXIT.PARAM,
    };
  }
  let wasDefault = false;
  const result = updateProfiles((current) => {
    if (!current.profiles[args.name]) {
      return { success: false, error: `Profile "${args.name}" not found`, exitCode: EXIT.PARAM };
    }
    const { [args.name]: _, ...rest } = current.profiles;
    wasDefault = current.default === args.name;
    const next: ProfilesFile = {
      version: 1,
      default: wasDefault ? null : current.default,
      profiles: rest,
    };
    return { success: true, data: next };
  });
  if (!result.success) return result;
  return { success: true, data: { removed: args.name, defaultCleared: wasDefault } };
}
