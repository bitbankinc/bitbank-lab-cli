import { EXIT } from "../../exit-codes.js";
import { updateProfiles } from "../../profiles-mutate.js";
import type { Result } from "../../types.js";

export async function profileSetDefault(args: {
  name: string;
}): Promise<Result<{ default: string }>> {
  const result = updateProfiles((current) => {
    if (!current.profiles[args.name]) {
      return {
        success: false,
        error: `Profile "${args.name}" not found`,
        exitCode: EXIT.PARAM,
      };
    }
    return { success: true, data: { ...current, default: args.name } };
  });
  if (!result.success) return result;
  return { success: true, data: { default: args.name } };
}
