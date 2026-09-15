import { withStatePath } from "../../paper-result.js";
import { defaultStatePath, deleteState } from "../../paper-state.js";
import type { Result } from "../../types.js";

export type PaperResetArgs = {
  confirm?: boolean;
  statePath?: string;
};

export async function paperReset(args: PaperResetArgs = {}): Promise<Result<{ deleted: true }>> {
  if (!args.confirm) {
    return {
      success: false,
      error: "reset requires --confirm to avoid accidental deletion.",
    };
  }
  const path = args.statePath ?? defaultStatePath();
  return withStatePath(await deleteState(path), path);
}
